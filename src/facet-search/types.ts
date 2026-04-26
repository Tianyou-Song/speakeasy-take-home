import type { LiqeQuery } from "liqe";
import type { ReactNode } from "react";

export type FacetType = "enum" | "string" | "number";

export type ChipVariant =
  | "neutral"
  | "info"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export interface FacetConfig<T> {
  key: string;
  label: string;
  description?: string;
  type: FacetType;
  accessor?: (row: T) => string | number;
  formatChipValue?: (value: string | number) => ReactNode;
  formatOptionValue?: (value: string | number) => ReactNode;
  chipVariant?: (value: string | number) => ChipVariant;
}

export type Op = ">" | ">=" | "<" | "<=" | "..";

export interface Token {
  id: string;
  facetKey: string;
  value: string;
  isPattern?: boolean;
  negated?: boolean;
  op?: Op;
}

// Phase 4: analytical / aggregation queries.
// `count` is the only aggregator for v1 — keeping the field in the type so
// avg/min/max/p95 can be added as a localized change later.
export type AggregationOrder = "count_desc" | "count_asc";

export interface Aggregation {
  groupBy: string;            // facet key — validated against live schema
  aggregator: "count";
  orderBy: AggregationOrder;
  limit: number;              // 1..20
}

export interface TopNRow {
  value: string;
  count: number;
  share: number;              // 0..1, count / total considered
}

export type Draft =
  | { mode: "idle"; text: string }
  | { mode: "value"; facetKey: string; partial: string; negated: boolean };

export interface MatchedSuggestion {
  key: string;
  score: number;
  ranges: [number, number][];
}

export const VARIANT_STYLES: Record<
  ChipVariant,
  { chip: string; label: string; dot: string }
> = {
  neutral: {
    chip: "bg-zinc-800/70 border-zinc-700/70 text-zinc-100 hover:bg-zinc-800",
    label: "text-zinc-400",
    dot: "bg-zinc-400",
  },
  info: {
    chip: "bg-sky-500/10 border-sky-400/30 text-sky-200 hover:bg-sky-500/15",
    label: "text-sky-400/80",
    dot: "bg-sky-400",
  },
  accent: {
    chip: "bg-violet-500/10 border-violet-400/30 text-violet-200 hover:bg-violet-500/15",
    label: "text-violet-400/80",
    dot: "bg-violet-400",
  },
  success: {
    chip: "bg-emerald-500/10 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/15",
    label: "text-emerald-400/80",
    dot: "bg-emerald-400",
  },
  warning: {
    chip: "bg-amber-500/10 border-amber-400/30 text-amber-200 hover:bg-amber-500/15",
    label: "text-amber-400/80",
    dot: "bg-amber-400",
  },
  danger: {
    chip: "bg-rose-500/10 border-rose-400/30 text-rose-200 hover:bg-rose-500/15",
    label: "text-rose-400/80",
    dot: "bg-rose-400",
  },
};

export function getFacetValue<T>(row: T, facet: FacetConfig<T>): string | number {
  if (facet.accessor) return facet.accessor(row);
  return (row as Record<string, unknown>)[facet.key] as string | number;
}

export function resolveChipDisplay<T>(
  facet: FacetConfig<T> | undefined,
  value: string,
): { variant: ChipVariant; display: ReactNode; label: string } {
  return {
    variant: facet?.chipVariant?.(value) ?? "neutral",
    display: facet?.formatChipValue?.(value) ?? value,
    label: facet?.label ?? "",
  };
}

// Canonical written form of a single token: leading "-" for negation; ASCII
// comparators (">=", "<=", ">", "<"); ".." infix for ranges. The "!" inline
// negation form is parsed but never produced.
export function serialiseToken(t: Token): string {
  const prefix = t.negated ? "-" : "";
  if (t.op === "..") return `${prefix}${t.facetKey}:${t.value}`;
  if (t.op) return `${prefix}${t.facetKey}:${t.op}${t.value}`;
  return `${prefix}${t.facetKey}:${t.value}`;
}

export function serialiseTokens(tokens: Token[]): string {
  return tokens.map(serialiseToken).join(" ");
}

// Order-independent identity key for tokens; thin wrapper over canonicalQueryKey.
export function canonicalTokenKey(tokens: Token[]): string {
  return canonicalQueryKey(tokens, null);
}

// Full-state identity key: tokens + aggregation. Two queries that describe the
// same reproducible result (same filters AND same group-by/order/limit) produce
// the same key. The "|" separator keeps the token segment from colliding with
// the agg segment when one side is empty.
export function canonicalQueryKey(
  tokens: Token[],
  aggregation: Aggregation | null,
): string {
  const t = tokens.map(serialiseToken).sort().join(" ");
  const a = aggregation
    ? `${aggregation.groupBy}:${aggregation.aggregator}:${aggregation.orderBy}:${aggregation.limit}`
    : "";
  return `${t}|${a}`;
}

// Display-friendly summary of an aggregation, e.g. "Top 5 by domain".
export function aggregationSummary(
  aggregation: Aggregation,
  facetLabel?: string,
): string {
  const dir = aggregation.orderBy === "count_asc" ? "Bottom" : "Top";
  const label = facetLabel ?? aggregation.groupBy;
  return `${dir} ${aggregation.limit} by ${label}`;
}

export function isPatternValue(value: string): boolean {
  return value.includes("*");
}

export function isPatternFacet<T>(facet: FacetConfig<T>): boolean {
  // Wildcards add no value on enums (finite known set); restrict to string/number.
  return facet.type !== "enum";
}

// Canonical query state. Two modes:
//   - "simple": flat AND of facet predicates → renders as conventional chip rail.
//     Every existing typed/NL query falls here, so the simple shape is the
//     overwhelmingly common case and back-compat path.
//   - "advanced": anything that doesn't flatten (cross-facet OR, deep parens,
//     mixed AND/OR with cross-facet predicates, regex literals). Renders as
//     a single "advanced query" chip with the raw text. Click-to-edit puts
//     the text back in the input.
//
// `text` on advanced is the canonical user-typed source; `ast` is the parsed
// liqe expression used for evaluation. Keeping both means we round-trip
// exactly through URL/storage without re-stringifying liqe's AST (which
// loses incidental whitespace and quoting).
export type Query =
  | { mode: "simple"; tokens: Token[] }
  | { mode: "advanced"; text: string; ast: LiqeQuery };

export const EMPTY_QUERY: Query = { mode: "simple", tokens: [] };

export function isSimpleQuery(
  q: Query,
): q is { mode: "simple"; tokens: Token[] } {
  return q.mode === "simple";
}

// Tokens-only convenience: simple → its token list, advanced → []. Used by the
// chip rail when the consumer only renders simple chips and the advanced-mode
// chip is rendered separately.
export function tokensOf(query: Query): Token[] {
  return query.mode === "simple" ? query.tokens : [];
}

// Canonical written form of a Query — what URL `?q=` writes and saved views
// store. Simple mode joins serialised tokens with whitespace (implicit AND);
// advanced mode emits the user's typed text verbatim so quoting/parens
// survive round-trips.
export function serialiseQuery(query: Query): string {
  return query.mode === "simple"
    ? serialiseTokens(query.tokens)
    : query.text;
}

// Flatten a row to `{ [facetKey]: value }` for liqe's reflection-based
// filter/test. Liqe walks the row by field name (e.g. `domain:foo` reads
// `row.domain`), so a row whose facets are sourced from accessors must be
// projected first. Numbers stay as numbers so `status:>=400` does numeric
// comparison rather than string lexical compare.
export function projectRow<T>(
  row: T,
  facets: FacetConfig<T>[],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const facet of facets) out[facet.key] = getFacetValue(row, facet);
  return out;
}

// Mouse-only `~` button on a dropdown row commits a wildcard-style chip
// derived from the row's literal value. Numeric facets get the HTTP-class
// `<first-digit>*` form (e.g. `500` → `5*`); string facets get
// `*value*` (contains). Enums fall through to the literal value, but
// `FacetSuggestions` should hide the button on enum rows so this branch
// is never reached in practice — keeping it makes the helper safe to call
// from any future surface.
export function derivePatternFromValue(
  value: string,
  facetType: FacetType,
): string {
  if (facetType === "number") {
    const first = value.match(/^[0-9]/)?.[0];
    return first ? `${first}*` : value;
  }
  if (facetType === "string") return `*${value}*`;
  return value;
}

export function relativeTime(savedAt: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - savedAt);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(savedAt).toLocaleDateString();
}
