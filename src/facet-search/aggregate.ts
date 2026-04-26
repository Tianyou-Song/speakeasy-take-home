import {
  getFacetValue,
  type Aggregation,
  type FacetConfig,
  type TopNRow,
} from "./types";

/**
 * Group rows by `agg.groupBy` value, count occurrences, sort, take `limit`.
 *
 * Pure / deterministic — runs over the rows the caller passes in (typically the
 * already-filtered set), so the analytical answer respects active filter chips.
 *
 * Reuses `getFacetValue` so accessor-mapped facets (e.g. `status -> statusCode`)
 * continue to work without special-casing.
 */
export function topNBy<T>(
  rows: T[],
  facet: FacetConfig<T>,
  agg: Aggregation,
): TopNRow[] {
  if (rows.length === 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(getFacetValue(row, facet));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = rows.length;
  const entries: TopNRow[] = Array.from(counts, ([value, count]) => ({
    value,
    count,
    share: total > 0 ? count / total : 0,
  }));
  entries.sort((a, b) => {
    if (a.count !== b.count) {
      return agg.orderBy === "count_asc" ? a.count - b.count : b.count - a.count;
    }
    // Stable secondary sort: numeric facets ascending, otherwise alpha.
    if (facet.type === "number") return Number(a.value) - Number(b.value);
    return a.value.localeCompare(b.value);
  });
  const limit = Math.max(1, Math.min(20, Math.floor(agg.limit) || 5));
  return entries.slice(0, limit);
}
