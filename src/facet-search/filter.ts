import type {
  LiqeQuery,
  ParserAst,
  TagToken,
} from "liqe";
import { getFacetValue, isSimpleQuery } from "./types";
import type { FacetConfig, Op, Query, Token } from "./types";

const patternCache = new WeakMap<Token, RegExp>();

function compilePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`, "i");
}

// Does this token's value-side match this row's value? Pure equality / pattern
// / numeric-op test — does NOT consider `negated`. Group-level polarity is
// applied in `filterRows` so this stays a clean per-(token, value) predicate.
export function matchTokenValue(tok: Token, valueStr: string): boolean {
  if (tok.op) {
    const n = Number(valueStr);
    if (!Number.isFinite(n)) return false;
    if (tok.op === "..") {
      const [loStr, hiStr] = tok.value.split("..");
      const lo = Number(loStr);
      const hi = Number(hiStr);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
      return n >= lo && n <= hi;
    }
    const target = Number(tok.value);
    if (!Number.isFinite(target)) return false;
    switch (tok.op) {
      case ">":  return n > target;
      case ">=": return n >= target;
      case "<":  return n < target;
      case "<=": return n <= target;
    }
    return false;
  }
  if (tok.isPattern) {
    let re = patternCache.get(tok);
    if (!re) {
      re = compilePattern(tok.value);
      patternCache.set(tok, re);
    }
    return re.test(valueStr);
  }
  return tok.value === valueStr;
}

export function compilePatternRegex(pattern: string): RegExp {
  return compilePattern(pattern);
}

// AND across different facet keys. Within one facet:
//   * positive tokens are OR'd  — row must match at least one
//   * negative tokens are AND'd — row must match none
// A facet group with only negatives skips the positive-existence check, so
// `-status:500` alone passes every row except 500s.
function filterRowsSimple<T>(
  rows: T[],
  tokens: Token[],
  facetByKey: Map<string, FacetConfig<T>>,
): T[] {
  if (tokens.length === 0) return rows;

  const groupedPos = new Map<string, Token[]>();
  const groupedNeg = new Map<string, Token[]>();
  for (const tok of tokens) {
    const target = tok.negated ? groupedNeg : groupedPos;
    const arr = target.get(tok.facetKey);
    if (arr) arr.push(tok);
    else target.set(tok.facetKey, [tok]);
  }

  const allKeys = new Set<string>();
  for (const k of groupedPos.keys()) allKeys.add(k);
  for (const k of groupedNeg.keys()) allKeys.add(k);

  return rows.filter((row) => {
    for (const key of allKeys) {
      const facet = facetByKey.get(key);
      if (!facet) return false;
      const valueStr = String(getFacetValue(row, facet));
      const positives = groupedPos.get(key);
      const negatives = groupedNeg.get(key);
      if (positives && !positives.some((t) => matchTokenValue(t, valueStr))) return false;
      if (negatives && negatives.some((t) => matchTokenValue(t, valueStr))) return false;
    }
    return true;
  });
}

// Top-level filter dispatch. Simple mode keeps the existing evaluator
// (load-bearing, untouched); advanced mode walks the liqe AST and applies
// the same per-Tag matchTokenValue used by simple mode — so semantics at the
// leaves never diverge between modes (no liqe substring-vs-equality drift).
export function filterRows<T>(
  rows: T[],
  query: Query | Token[],
  facetByKey: Map<string, FacetConfig<T>>,
  facets?: FacetConfig<T>[],
): T[] {
  // Back-compat overload: callers that still pass a bare Token[] (recents,
  // saved-view restore, NL pipeline) keep working unchanged.
  if (Array.isArray(query)) return filterRowsSimple(rows, query, facetByKey);

  if (isSimpleQuery(query)) return filterRowsSimple(rows, query.tokens, facetByKey);

  const list = facets ?? Array.from(facetByKey.values());
  return rows.filter((row) => evaluateAST(query.ast, row, list));
}

// Walk the liqe AST and return whether `row` matches. Tag leaves are
// converted to a transient Token shape (op/pattern/equality) and run through
// the same matchTokenValue used by simple-mode filtering. AND/OR/NOT compose
// at branches; parens unwrap; EmptyExpression always matches.
export function evaluateAST<T>(
  ast: LiqeQuery,
  row: T,
  facets: FacetConfig<T>[],
): boolean {
  const facetByKey = new Map(facets.map((f) => [f.key, f]));
  return evalNode(ast, row, facetByKey);
}

function evalNode<T>(
  node: ParserAst,
  row: T,
  facetByKey: Map<string, FacetConfig<T>>,
): boolean {
  switch (node.type) {
    case "Tag":
      return evalTag(node, row, facetByKey);
    case "LogicalExpression": {
      const isOr = node.operator.operator === "OR";
      const left = evalNode(node.left, row, facetByKey);
      // Short-circuit so a passing OR-left or failing AND-left skips the right walk.
      if (isOr ? left : !left) return left;
      return evalNode(node.right, row, facetByKey);
    }
    case "ParenthesizedExpression":
      return evalNode(node.expression as ParserAst, row, facetByKey);
    case "UnaryOperator":
      return !evalNode(node.operand, row, facetByKey);
    case "EmptyExpression":
      return true;
  }
}

function evalTag<T>(
  tag: TagToken,
  row: T,
  facetByKey: Map<string, FacetConfig<T>>,
): boolean {
  if (tag.field.type !== "Field") return false;
  const facet = facetByKey.get(tag.field.name);
  if (!facet) return false;
  const valueStr = String(getFacetValue(row, facet));

  const expr = tag.expression;
  const opComp = tag.operator.operator;

  if (expr.type === "RangeExpression") {
    const { min, max, minInclusive, maxInclusive } = expr.range;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
    const lo = minInclusive ? min : min + 1;
    const hi = maxInclusive ? max : max - 1;
    if (lo > hi) return false;
    return matchTokenValue(
      { id: "_e", facetKey: tag.field.name, value: `${lo}..${hi}`, op: ".." },
      valueStr,
    );
  }

  if (opComp === ":>" || opComp === ":>=" || opComp === ":<" || opComp === ":<=") {
    if (expr.type !== "LiteralExpression") return false;
    const op: Op =
      opComp === ":>" ? ">" :
      opComp === ":>=" ? ">=" :
      opComp === ":<" ? "<" : "<=";
    return matchTokenValue(
      { id: "_e", facetKey: tag.field.name, value: String(expr.value), op },
      valueStr,
    );
  }

  if (expr.type === "LiteralExpression") {
    const value = String(expr.value);
    const isPattern = value.includes("*") && facet.type !== "enum";
    return matchTokenValue(
      { id: "_e", facetKey: tag.field.name, value, ...(isPattern ? { isPattern: true } : {}) },
      valueStr,
    );
  }

  if (expr.type === "RegexExpression") {
    try {
      const m = expr.value.match(/^\/(.*)\/([a-z]*)$/);
      const pattern = m ? m[1] : expr.value;
      const flags = m ? m[2] : "";
      return new RegExp(pattern, flags).test(valueStr);
    } catch {
      return false;
    }
  }

  return false;
}

export function uniqueValuesForFacet<T>(
  rows: T[],
  facet: FacetConfig<T>,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = String(getFacetValue(row, facet));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out = Array.from(counts, ([value, count]) => ({ value, count }));
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (facet.type === "number") return Number(a.value) - Number(b.value);
    return a.value.localeCompare(b.value);
  });
  return out;
}
