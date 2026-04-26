import { parse as liqeParse } from "liqe";
import type {
  LiqeQuery,
  LogicalExpressionToken,
  ParserAst,
  TagToken,
} from "liqe";
import type {
  Draft,
  FacetConfig,
  FacetType,
  Op,
  Query,
  Token,
} from "./types";

export function parseDraft<T>(
  input: string,
  facets: FacetConfig<T>[],
): Draft {
  let text = input;
  let negated = false;

  // Consume a leading "-" as facet-level negation only when the head between
  // "-" and ":" matches a known facet key. Otherwise the "-" is preserved as
  // a literal so values like `domain:my-host.com` and `path:/api-v1/users`
  // are unaffected, and bare free-text starting with "-" stays free text.
  if (text.startsWith("-") && text.length > 1) {
    const colon = text.indexOf(":");
    if (colon > 1) {
      const head = text.slice(1, colon);
      if (facets.some((f) => f.key === head)) {
        negated = true;
        text = text.slice(1);
      }
    }
  }

  const colon = text.indexOf(":");
  if (colon === -1) return { mode: "idle", text: input };
  const head = text.slice(0, colon);
  const tail = text.slice(colon + 1);
  if (!facets.some((f) => f.key === head)) {
    return { mode: "idle", text: input };
  }
  return { mode: "value", facetKey: head, partial: tail, negated };
}

export interface ParsedValue {
  op?: Op;
  value: string;
  inlineNegated: boolean;
  isPattern: boolean;
  invalid?: "non-numeric-op" | "bad-range";
}

// Parse the post-":" part of a value into op + value, with inline negation
// ("!") and wildcard detection. Surfaces invalid shapes (op on non-numeric
// facet, reversed ".." range) so the dropdown can render a non-committable
// hint instead of silently dropping the user's input.
export function parseValuePart(partial: string, facetType: FacetType): ParsedValue {
  let s = partial;
  let inlineNegated = false;

  if (s.startsWith("!")) {
    inlineNegated = true;
    s = s.slice(1);
  }

  let op: Op | undefined;
  if (s.startsWith(">=")) { op = ">="; s = s.slice(2); }
  else if (s.startsWith("<=")) { op = "<="; s = s.slice(2); }
  else if (s.startsWith(">")) { op = ">"; s = s.slice(1); }
  else if (s.startsWith("<")) { op = "<"; s = s.slice(1); }

  if (!op && s.includes("..")) {
    const idx = s.indexOf("..");
    const lo = s.slice(0, idx);
    const hi = s.slice(idx + 2);
    if (lo && hi) {
      const value = `${lo}..${hi}`;
      if (facetType !== "number") {
        return { op: "..", value, inlineNegated, isPattern: false, invalid: "non-numeric-op" };
      }
      const loN = Number(lo);
      const hiN = Number(hi);
      if (!Number.isFinite(loN) || !Number.isFinite(hiN) || loN > hiN) {
        return { op: "..", value, inlineNegated, isPattern: false, invalid: "bad-range" };
      }
      return { op: "..", value, inlineNegated, isPattern: false };
    }
  }

  if (op) {
    if (facetType !== "number") {
      return { op, value: s, inlineNegated, isPattern: false, invalid: "non-numeric-op" };
    }
    return { op, value: s, inlineNegated, isPattern: false };
  }

  return { value: s, inlineNegated, isPattern: s.includes("*") };
}

// Parse a whitespace-separated serialised query (the canonical form
// `serialiseTokens` produces) into a Token[]. Used by URL `?q=` sync to
// round-trip filters. Malformed or unknown-facet chunks are silently dropped
// so a hand-edited URL never throws.
export function parseSerialisedQuery<T>(
  s: string,
  facets: FacetConfig<T>[],
): Token[] {
  const out: Token[] = [];
  const facetByKey = new Map(facets.map((f) => [f.key, f]));
  for (const chunk of s.split(/\s+/)) {
    if (!chunk) continue;
    const draft = parseDraft(chunk, facets);
    if (draft.mode !== "value") continue;
    const facet = facetByKey.get(draft.facetKey);
    if (!facet) continue;
    const parsed = parseValuePart(draft.partial, facet.type);
    if (parsed.invalid) continue;
    if (!parsed.value) continue;
    const negated = draft.negated || parsed.inlineNegated;
    const tok: Token = { id: nextTokenId(), facetKey: draft.facetKey, value: parsed.value };
    if (parsed.isPattern) tok.isPattern = true;
    if (negated) tok.negated = true;
    if (parsed.op) tok.op = parsed.op;
    out.push(tok);
  }
  return out;
}

let tokenIdSeq = 0;
export function nextTokenId(): string {
  tokenIdSeq += 1;
  return `tok_${Date.now().toString(36)}_${tokenIdSeq}`;
}

// ─── Datadog DSL surface (liqe-backed) ──────────────────────────────────────

export type ParseError =
  | { kind: "syntax"; message: string }
  | { kind: "unknown-facet"; facetKey: string };

export interface ParseQueryResult {
  query: Query | null;
  errors: ParseError[];
}

// Whether a query string contains constructs only the liqe pipeline handles.
// The simple-mode fast path covers the chip-friendly grammar
// (`field:value` chunks, "-" negation, "..", ">=" comparators, "*" wildcards
// — and bare paths like `path:/api/v1` that liqe rejects unless quoted).
// We only invoke liqe when one of these advanced markers appears. Quotes are
// markers because the simple-mode parser is character-level and doesn't know
// to strip them; routing through liqe produces an unquoted token value.
const ADVANCED_SYNTAX_RE =
  /(\bAND\b|\bOR\b|\bNOT\b|\(|\)|\[[^\]]*\bTO\b[^\]]*\]|\{[^}]*\bTO\b[^}]*\}|["'])/;

export function hasAdvancedSyntax(text: string): boolean {
  return ADVANCED_SYNTAX_RE.test(text);
}

// Pre-normalise Datadog forms liqe doesn't natively parse:
//   * `field:(a OR b [OR c])` → `(field:a OR field:b [OR field:c])`
//     (liqe rejects value-side parens; expand to a top-level OR-of-tags)
//   * `field:N..M` → `field:[N TO M]` (our shorthand → liqe's range form)
// Conservative: only expands within known-facet bindings, with no nested
// parens/quotes in the inner content. Anything else is left alone for liqe
// to handle (or fail) verbatim.
export function preNormalise<T>(
  text: string,
  facets: FacetConfig<T>[],
): string {
  if (facets.length === 0) return text;
  const keyAlt = facets.map((f) => escapeRegex(f.key)).join("|");

  let out = text.replace(
    new RegExp(`\\b(${keyAlt}):\\(([^()]+?)\\)`, "g"),
    (m, key: string, inner: string) => {
      const parts = inner
        .split(/\s+OR\s+/i)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 2) return m;
      return `(${parts.map((p) => `${key}:${p}`).join(" OR ")})`;
    },
  );

  out = out.replace(
    new RegExp(`\\b(${keyAlt}):(-?\\d+(?:\\.\\d+)?)\\.\\.(-?\\d+(?:\\.\\d+)?)`, "g"),
    "$1:[$2 TO $3]",
  );

  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Top-level parse. Returns a Query (simple|advanced) or null if liqe
// couldn't make sense of the text. Routing:
//   1. Empty → empty simple
//   2. No advanced markers → existing simple-mode parser (back-compat,
//      handles bare `path:/api/v1` that liqe rejects)
//   3. Advanced markers present → liqe.parse → flattenAST → simple if
//      it flattens to a flat AND of facet predicates, advanced otherwise
export function parseQuery<T>(
  text: string,
  facets: FacetConfig<T>[],
): ParseQueryResult {
  const trimmed = text.trim();
  if (!trimmed) return { query: { mode: "simple", tokens: [] }, errors: [] };

  if (!hasAdvancedSyntax(trimmed)) {
    const tokens = parseSerialisedQuery(trimmed, facets);
    return { query: { mode: "simple", tokens }, errors: [] };
  }

  const normalised = preNormalise(trimmed, facets);
  let ast: LiqeQuery;
  try {
    ast = liqeParse(normalised);
  } catch (e) {
    return {
      query: null,
      errors: [
        { kind: "syntax", message: e instanceof Error ? e.message : String(e) },
      ],
    };
  }

  const errors: ParseError[] = [];
  collectFieldErrors(ast, facets, errors);
  if (errors.length > 0) return { query: null, errors };

  const flat = flattenAST(ast, facets);
  if (flat.kind === "simple") {
    return { query: { mode: "simple", tokens: flat.tokens }, errors: [] };
  }
  return { query: { mode: "advanced", text: trimmed, ast }, errors: [] };
}

// Walks the AST and reports any Tag whose field name isn't a known facet.
// Skips ImplicitField (a Tag without `field:` prefix) — liqe's free-text mode,
// which we don't support and won't flatten.
function collectFieldErrors<T>(
  ast: ParserAst,
  facets: FacetConfig<T>[],
  out: ParseError[],
): void {
  const known = new Set(facets.map((f) => f.key));
  walkTags(ast, (tag) => {
    if (tag.field.type === "ImplicitField") {
      out.push({ kind: "unknown-facet", facetKey: "" });
      return;
    }
    if (!known.has(tag.field.name)) {
      out.push({ kind: "unknown-facet", facetKey: tag.field.name });
    }
  });
}

function walkTags(ast: ParserAst, visit: (tag: TagToken) => void): void {
  if (ast.type === "Tag") {
    visit(ast);
    return;
  }
  if (ast.type === "LogicalExpression") {
    walkTags(ast.left, visit);
    walkTags(ast.right, visit);
    return;
  }
  if (ast.type === "ParenthesizedExpression") {
    walkTags(ast.expression as ParserAst, visit);
    return;
  }
  if (ast.type === "UnaryOperator") {
    walkTags(ast.operand, visit);
    return;
  }
  // EmptyExpression — no-op
}

// ─── Flattening AST → Token[] (simple-mode rendering path) ──────────────────

export type FlattenResult =
  | { kind: "simple"; tokens: Token[] }
  | { kind: "advanced" };

// Flatten heuristic: succeed only when every top-level AND atom is one of:
//   1. A single Tag → 1 positive token
//   2. UnaryOperator(-/NOT) wrapping a single Tag → 1 negated token
//   3. ParenthesizedExpression wrapping an OR-chain of Tags with the SAME
//      field, all positive → N positive tokens for that facet
//
// Cases that fall to advanced mode (preserving semantics):
//   * Cross-facet OR (e.g. `method:GET OR status:500`) — simple mode treats
//     same-row predicates as AND across facets, no faithful representation.
//   * Same-facet AND of positives (e.g. `status:200 AND status:404`) —
//     simple mode ORs same-facet positives, opposite semantics.
//   * Negation of complex inner expressions, regex literals, mixed AND/OR
//     inside groups, anything we don't explicitly handle.
//
// The conservative heuristic biases toward correctness over completeness:
// the safe fallback (advanced mode) renders as a single chip with the raw
// text and uses the same evaluator (evaluateAST) as the typed input.
export function flattenAST<T>(
  ast: ParserAst,
  facets: FacetConfig<T>[],
): FlattenResult {
  const facetByKey = new Map(facets.map((f) => [f.key, f]));
  const atoms = collectAndAtoms(ast);
  const tokens: Token[] = [];
  for (const atom of atoms) {
    const fragment = convertAtom(atom, facetByKey);
    if (!fragment) return { kind: "advanced" };
    tokens.push(...fragment);
  }
  return { kind: "simple", tokens };
}

// Walk AND chains (implicit or explicit), unwrapping parens that contain
// further AND chains. Returns a flat list of atoms — each atom is the
// largest non-AND subtree at that position.
function collectAndAtoms(ast: ParserAst): ParserAst[] {
  if (ast.type === "ParenthesizedExpression") {
    const inner = ast.expression as ParserAst;
    if (
      inner.type === "LogicalExpression" &&
      inner.operator.operator === "AND"
    ) {
      return collectAndAtoms(inner);
    }
    return [inner];
  }
  if (
    ast.type === "LogicalExpression" &&
    ast.operator.operator === "AND"
  ) {
    return [...collectAndAtoms(ast.left), ...collectAndAtoms(ast.right)];
  }
  return [ast];
}

function convertAtom<T>(
  atom: ParserAst,
  facetByKey: Map<string, FacetConfig<T>>,
): Token[] | null {
  // Strip a wrapping Parenthesized once. Nested parens are unusual but
  // legal; the inner body is what we classify.
  let node: ParserAst = atom;
  if (node.type === "ParenthesizedExpression") {
    node = node.expression as ParserAst;
  }

  if (node.type === "Tag") {
    const tok = tagToToken(node, facetByKey, false);
    return tok ? [tok] : null;
  }

  if (node.type === "UnaryOperator") {
    let operand: ParserAst = node.operand;
    if (operand.type === "ParenthesizedExpression") {
      operand = operand.expression as ParserAst;
    }
    if (operand.type === "Tag") {
      const tok = tagToToken(operand, facetByKey, true);
      return tok ? [tok] : null;
    }
    // -(a OR b), NOT (a OR b) etc. would need DeMorgan distribution; punt to advanced.
    return null;
  }

  if (
    node.type === "LogicalExpression" &&
    node.operator.operator === "OR"
  ) {
    return convertOrGroup(node, facetByKey);
  }

  return null;
}

// Single-facet OR group: every leaf is a positive Tag bound to the same
// field. Returns one token per leaf. Mixed-facet, mixed-polarity, or
// non-Tag children → null (advanced).
function convertOrGroup<T>(
  ast: LogicalExpressionToken,
  facetByKey: Map<string, FacetConfig<T>>,
): Token[] | null {
  const leaves = collectOrLeaves(ast);
  if (!leaves) return null;
  let sharedKey: string | null = null;
  const out: Token[] = [];
  for (const leaf of leaves) {
    if (leaf.field.type !== "Field") return null;
    if (sharedKey === null) sharedKey = leaf.field.name;
    else if (sharedKey !== leaf.field.name) return null;
    const tok = tagToToken(leaf, facetByKey, false);
    if (!tok) return null;
    out.push(tok);
  }
  return out;
}

// Walk an OR-chain and return the leaves, but ONLY if every leaf is a
// positive Tag (no negation, no nested AND, no other subtree types).
// `null` means the OR chain has structure we don't flatten.
function collectOrLeaves(ast: ParserAst): TagToken[] | null {
  if (ast.type === "ParenthesizedExpression") {
    return collectOrLeaves(ast.expression as ParserAst);
  }
  if (ast.type === "Tag") return [ast];
  if (
    ast.type === "LogicalExpression" &&
    ast.operator.operator === "OR"
  ) {
    const left = collectOrLeaves(ast.left);
    if (!left) return null;
    const right = collectOrLeaves(ast.right);
    if (!right) return null;
    return [...left, ...right];
  }
  return null;
}

function tagToToken<T>(
  tag: TagToken,
  facetByKey: Map<string, FacetConfig<T>>,
  negated: boolean,
): Token | null {
  if (tag.field.type !== "Field") return null;
  const facet = facetByKey.get(tag.field.name);
  if (!facet) return null;

  const expr = tag.expression;
  const opComp = tag.operator.operator;

  // RangeExpression → ".." op token. Exclusive bounds are coerced to the
  // adjacent inclusive integer (status is integer in our schema), matching
  // Datadog's `{}` semantics. Non-integer fields get the same treatment but
  // would only land here if the user typed brackets on a string facet.
  if (expr.type === "RangeExpression") {
    const { min, max, minInclusive, maxInclusive } = expr.range;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const lo = minInclusive ? min : min + 1;
    const hi = maxInclusive ? max : max - 1;
    if (lo > hi) return null;
    const tok: Token = {
      id: nextTokenId(),
      facetKey: tag.field.name,
      value: `${lo}..${hi}`,
      op: "..",
    };
    if (negated) tok.negated = true;
    return tok;
  }

  // Comparison operators (`:>`, `:>=`, `:<`, `:<=`) → corresponding op token.
  // Only valid on numeric facets per our model; otherwise advanced mode.
  if (opComp === ":>" || opComp === ":>=" || opComp === ":<" || opComp === ":<=") {
    if (facet.type !== "number") return null;
    if (expr.type !== "LiteralExpression") return null;
    const num = String(expr.value);
    if (!Number.isFinite(Number(num))) return null;
    const op: Op =
      opComp === ":>" ? ">" :
      opComp === ":>=" ? ">=" :
      opComp === ":<" ? "<" : "<=";
    const tok: Token = {
      id: nextTokenId(),
      facetKey: tag.field.name,
      value: num,
      op,
    };
    if (negated) tok.negated = true;
    return tok;
  }

  if (expr.type === "LiteralExpression") {
    const value = String(expr.value);
    if (!value) return null;
    const tok: Token = {
      id: nextTokenId(),
      facetKey: tag.field.name,
      value,
    };
    if (value.includes("*") && facet.type !== "enum") tok.isPattern = true;
    if (negated) tok.negated = true;
    return tok;
  }

  // RegexExpression and EmptyExpression don't fit the chip model.
  return null;
}
