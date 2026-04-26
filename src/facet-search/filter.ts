import { getFacetValue } from "./types";
import type { FacetConfig, Token } from "./types";

const patternCache = new WeakMap<Token, RegExp>();

function compilePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`, "i");
}

export function matchToken(tok: Token, valueStr: string): boolean {
  if (!tok.isPattern) return tok.value === valueStr;
  let re = patternCache.get(tok);
  if (!re) {
    re = compilePattern(tok.value);
    patternCache.set(tok, re);
  }
  return re.test(valueStr);
}

export function compilePatternRegex(pattern: string): RegExp {
  return compilePattern(pattern);
}

// AND across different facet keys, OR within the same facet key.
export function filterRows<T>(
  rows: T[],
  tokens: Token[],
  facetByKey: Map<string, FacetConfig<T>>,
): T[] {
  if (tokens.length === 0) return rows;

  const grouped = new Map<string, Token[]>();
  for (const tok of tokens) {
    const arr = grouped.get(tok.facetKey);
    if (arr) arr.push(tok);
    else grouped.set(tok.facetKey, [tok]);
  }

  return rows.filter((row) => {
    for (const [key, groupTokens] of grouped) {
      const facet = facetByKey.get(key);
      if (!facet) return false;
      const valueStr = String(getFacetValue(row, facet));
      if (!groupTokens.some((t) => matchToken(t, valueStr))) return false;
    }
    return true;
  });
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
