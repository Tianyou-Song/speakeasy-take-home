import { useCallback, useMemo, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { topNBy } from "./aggregate";
import { fuzzyMatch } from "./match";
import { nextTokenId, parseDraft, parseQuery, parseValuePart } from "./parse";
import { compilePatternRegex, filterRows, matchTokenValue, uniqueValuesForFacet } from "./filter";
import {
  aggregationSummary,
  canonicalQueryKey,
  EMPTY_QUERY,
  isPatternFacet,
  isPatternValue,
  serialiseToken,
  serialiseTokens,
  tokensOf,
  type Aggregation,
  type Draft,
  type FacetConfig,
  type MatchedSuggestion,
  type Op,
  type Query,
  type Token,
  type TopNRow,
} from "./types";

export type Suggestion =
  | {
      kind: "facet";
      id: string;
      facetKey: string;
      label: string;
      description?: string;
      match?: MatchedSuggestion;
    }
  | {
      kind: "value";
      id: string;
      facetKey: string;
      value: string;
      count: number;
      negated: boolean;
      match?: MatchedSuggestion;
    }
  | {
      kind: "pattern";
      id: string;
      facetKey: string;
      pattern: string;
      matchCount: number;
      rowCount: number;
      negated: boolean;
    }
  | {
      kind: "range";
      id: string;
      facetKey: string;
      op: Op;
      value: string;
      matchCount: number;
      rowCount: number;
      negated: boolean;
    }
  | {
      kind: "invalid";
      id: string;
      reason: "non-numeric-op" | "bad-range";
      message: string;
    }
  | {
      kind: "recent";
      id: string;
      tokens: Token[];
      label: string;
      savedAt: number;
      nlText?: string;
    }
  | {
      kind: "saved";
      id: string;
      viewId: string;
      name: string;
      tokens: Token[];
      // Full state to restore when this suggestion is committed.
      aggregation: Aggregation | null;
      nlText?: string;
      // Raw advanced-mode source. When present, restore re-parses this and
      // switches the query to advanced mode; tokens is empty for these views.
      advancedText?: string;
      label: string;
    };

export type Section = {
  id: string;
  heading: string;
  items: Suggestion[];
};

import type { SavedView } from "./useSavedViews";

export interface UseFacetSearchArgs<T> {
  rows: T[];
  facets: FacetConfig<T>[];
  storageKey?: string;
  savedViews?: SavedView[];
}

export interface RecentEntry {
  tokens: Token[];
  savedAt: number;
  // Original natural-language query when the entry came from NL search,
  // so the recents row can render the sentence rather than serialised tokens.
  nlText?: string;
}

export interface ApplyNLArgs {
  tokens: Token[];
  aggregation: Aggregation | null;
  nlText?: string;
}

// Sentinel chip id for the advanced-mode pseudo-chip. Lives in the same id
// space as real token ids so the chip rail can key/uniqueId the rendered
// chip without a separate code path.
export const ADVANCED_CHIP_ID = "_advanced";

export interface UseFacetSearchResult<T> {
  query: Query;
  // Derived from query: simple → its tokens, advanced → []. Kept as a
  // first-class field so existing consumers (chip rendering, URL sync)
  // don't need to know about the union type.
  tokens: Token[];
  inputValue: string;
  setInputValue: (next: string) => void;
  draft: Draft;
  filteredRows: T[];
  sections: Section[];
  itemCount: number;
  facetByKey: Map<string, FacetConfig<T>>;
  commitAt: (index: number) => void;
  commit: (s: Suggestion) => void;
  // Parses the current input — or the explicit `textOverride` — as a whole
  // query (the liqe-backed entry path for AND/OR/NOT/parens/brackets/quotes).
  // Returns true on a successful commit (input is consumed and cleared when
  // textOverride is omitted); false if the parse produced no useful query,
  // so the caller can fall through to NL or other handling.
  commitDraft: (textOverride?: string) => boolean;
  removeToken: (id: string) => void;
  removeTokensByIds: (ids: string[]) => void;
  applyTokens: (tokens: Token[], nlText?: string) => void;
  applyNLResult: (args: ApplyNLArgs) => void;
  aggregation: Aggregation | null;
  setAggregation: (a: Aggregation | null) => void;
  topN: TopNRow[] | null;
  editLastToken: () => void;
  editToken: (id: string) => void;
  clearAll: () => void;
  saveCurrentAsRecent: () => void;
  recents: RecentEntry[];
  matchedSavedView: SavedView | null;
}

const RECENTS_LIMIT = 6;
// v4: RecentEntry gained optional advanced-mode `text` for queries that
// don't flatten to a flat AND of facet predicates. v1/v2/v3 still loadable
// via the legacy paths in deserialiseRecents.
const DEFAULT_STORAGE_KEY = "facet-search:recents:v4";

const byMatchScoreDesc = (a: Suggestion, b: Suggestion): number => {
  const sa = "match" in a && a.match ? a.match.score : 0;
  const sb = "match" in b && b.match ? b.match.score : 0;
  return sb - sa;
};

export function useFacetSearch<T>({
  rows,
  facets,
  storageKey = DEFAULT_STORAGE_KEY,
  savedViews = [],
}: UseFacetSearchArgs<T>): UseFacetSearchResult<T> {
  const [query, setQuery] = useState<Query>(EMPTY_QUERY);
  const [inputValue, setInputValueRaw] = useState("");
  const [aggregation, setAggregationRaw] = useState<Aggregation | null>(null);
  const [recents, setRecents] = useLocalStorage<RecentEntry[]>(storageKey, [], {
    serializer: serialiseRecents,
    deserializer: deserialiseRecents,
    initializeWithValue: typeof window !== "undefined",
  });

  // Derived: simple-mode chip list. Empty in advanced mode (the advanced
  // chip is rendered separately by the chip rail).
  const tokens = useMemo(() => tokensOf(query), [query]);

  const draft = useMemo(() => parseDraft(inputValue, facets), [inputValue, facets]);

  const facetByKey = useMemo(
    () => new Map<string, FacetConfig<T>>(facets.map((f) => [f.key, f])),
    [facets],
  );

  const filteredRows = useMemo(
    () => filterRows(rows, query, facetByKey, facets),
    [rows, query, facetByKey, facets],
  );

  const topN = useMemo<TopNRow[] | null>(() => {
    if (!aggregation) return null;
    const facet = facetByKey.get(aggregation.groupBy);
    if (!facet) return null;
    return topNBy(filteredRows, facet, aggregation);
  }, [aggregation, facetByKey, filteredRows]);

  // Pre-aggregate distinct values once per (rows, facets) pair so per-keystroke
  // dropdown rebuilds in value mode are O(uniques), not O(rows).
  const uniquesByFacet = useMemo(() => {
    const m = new Map<string, ReturnType<typeof uniqueValuesForFacet<T>>>();
    for (const facet of facets) m.set(facet.key, uniqueValuesForFacet(rows, facet));
    return m;
  }, [facets, rows]);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];

    if (draft.mode === "idle") {
      const text = draft.text.trim();

      const facetItems: Suggestion[] = [];
      for (const facet of facets) {
        const m = fuzzyMatch(text, `${facet.key}:${facet.label}`);
        if (m == null) continue;
        facetItems.push({
          kind: "facet",
          id: `facet:${facet.key}`,
          facetKey: facet.key,
          label: facet.label,
          description: facet.description,
          match: text ? { key: facet.key, score: m.score, ranges: m.ranges } : undefined,
        });
      }
      facetItems.sort(byMatchScoreDesc);
      if (facetItems.length > 0) {
        out.push({ id: "facets", heading: "Facets", items: facetItems });
      }

      if (!text && savedViews.length > 0) {
        out.push({
          id: "saved",
          heading: "Saved Views",
          items: savedViews.map((view) => ({
            kind: "saved",
            id: `saved:${view.id}`,
            viewId: view.id,
            name: view.name,
            tokens: view.tokens,
            aggregation: view.aggregation ?? null,
            ...(view.nlText ? { nlText: view.nlText } : {}),
            ...(view.advancedText ? { advancedText: view.advancedText } : {}),
            label: savedViewLabel(view, facetByKey),
          })),
        });
      }

      if (!text && recents.length > 0) {
        out.push({
          id: "recent",
          heading: "Recent",
          items: recents.map((entry, i) => ({
            kind: "recent",
            id: `recent:${i}`,
            tokens: entry.tokens,
            label: serialiseTokens(entry.tokens),
            savedAt: entry.savedAt,
            ...(entry.nlText ? { nlText: entry.nlText } : {}),
          })),
        });
      }
    } else {
      const facet = facetByKey.get(draft.facetKey);
      if (facet) {
        const all = uniquesByFacet.get(draft.facetKey) ?? [];
        const items: Suggestion[] = [];
        const partial = draft.partial;
        const negated = draft.negated;
        const parsed = parseValuePart(partial, facet.type);

        if (parsed.invalid === "non-numeric-op") {
          items.push({
            kind: "invalid",
            id: `invalid:${facet.key}:non-numeric-op`,
            reason: "non-numeric-op",
            message: `Range and comparison filters apply only to numeric facets — ${facet.label} is ${facet.type}.`,
          });
        } else if (parsed.invalid === "bad-range") {
          items.push({
            kind: "invalid",
            id: `invalid:${facet.key}:bad-range`,
            reason: "bad-range",
            message: "Range start must be less than or equal to range end.",
          });
        } else if (parsed.op && parsed.value) {
          // Build a single committable range/comparator row. Counts are
          // computed against the full distinct-value set (matches existing
          // pattern-row semantics for consistency).
          const probe: Token = {
            id: "_probe",
            facetKey: facet.key,
            value: parsed.value,
            op: parsed.op,
          };
          let matchCount = 0;
          let rowCount = 0;
          for (const { value, count } of all) {
            if (matchTokenValue(probe, value)) {
              matchCount += 1;
              rowCount += count;
            }
          }
          if (matchCount > 0) {
            items.push({
              kind: "range",
              id: `range:${facet.key}:${parsed.op}:${parsed.value}`,
              facetKey: facet.key,
              op: parsed.op,
              value: parsed.value,
              matchCount,
              rowCount,
              negated: negated || parsed.inlineNegated,
            });
          }
        } else {
          // Plain value typing — wildcard or equality pick from the value list.
          const effectiveNegated = negated || parsed.inlineNegated;
          const wildcardActive = isPatternValue(parsed.value) && isPatternFacet(facet);

          if (wildcardActive) {
            const re = compilePatternRegex(parsed.value);
            let matchCount = 0;
            let rowCount = 0;
            for (const { value, count } of all) {
              if (re.test(value)) {
                matchCount += 1;
                rowCount += count;
              }
            }
            items.push({
              kind: "pattern",
              id: `pattern:${facet.key}:${parsed.value}`,
              facetKey: facet.key,
              pattern: parsed.value,
              matchCount,
              rowCount,
              negated: effectiveNegated,
            });
          }

          const valueQuery = parsed.value;
          for (const { value, count } of all) {
            const m = valueQuery ? fuzzyMatch(valueQuery, value) : { score: 0, ranges: [] };
            if (m == null) continue;
            items.push({
              kind: "value",
              id: `value:${facet.key}:${value}`,
              facetKey: facet.key,
              value,
              count,
              negated: effectiveNegated,
              match: valueQuery ? { key: value, score: m.score, ranges: m.ranges } : undefined,
            });
          }
          if (valueQuery && !wildcardActive) items.sort(byMatchScoreDesc);
          else if (valueQuery && wildcardActive) {
            const [first, ...rest] = items;
            rest.sort(byMatchScoreDesc);
            items.length = 0;
            items.push(first, ...rest);
          }
        }

        out.push({
          id: `values:${facet.key}`,
          heading: `${facet.label} values`,
          items,
        });
      }
    }

    return out;
  }, [draft, facets, recents, facetByKey, uniquesByFacet, savedViews]);

  // Identifies whether the current full query state (tokens + aggregation)
  // exactly matches a saved view (order-independent). The single source of
  // truth for the star button's saved/unsaved visual state.
  //
  // Advanced-mode queries match by canonical text (an exact-string compare):
  // the AST has structural variation (parens, whitespace) that legitimately
  // distinguishes user intent, so we don't try to canonicalise across them.
  const matchedSavedView = useMemo<SavedView | null>(() => {
    if (query.mode === "advanced") {
      return savedViews.find((v) => v.advancedText === query.text) ?? null;
    }
    if (tokens.length === 0 && aggregation === null) return null;
    const key = canonicalQueryKey(tokens, aggregation);
    return (
      savedViews.find(
        (v) =>
          !v.advancedText &&
          canonicalQueryKey(v.tokens, v.aggregation ?? null) === key,
      ) ?? null
    );
  }, [query, tokens, aggregation, savedViews]);

  const itemCount = useMemo(
    () => sections.reduce((acc, s) => acc + s.items.length, 0),
    [sections],
  );

  const setInputValue = useCallback((next: string) => setInputValueRaw(next), []);

  // Append a single new token to a simple-mode query. In advanced mode the
  // dropdown shouldn't be offering chip-add suggestions (the input is empty
  // until the user edits the advanced chip), so we no-op rather than
  // destroy the user's typed query.
  const appendToken = useCallback((tok: Token) => {
    setQuery((prev) => {
      if (prev.mode === "advanced") return prev;
      return { mode: "simple", tokens: [...prev.tokens, tok] };
    });
    setInputValueRaw("");
  }, []);

  const commit = useCallback((s: Suggestion) => {
    if (s.kind === "facet") {
      setInputValueRaw(`${s.facetKey}:`);
      return;
    }
    if (s.kind === "value") {
      const tok: Token = { id: nextTokenId(), facetKey: s.facetKey, value: s.value };
      if (s.negated) tok.negated = true;
      appendToken(tok);
      return;
    }
    if (s.kind === "pattern") {
      const tok: Token = {
        id: nextTokenId(),
        facetKey: s.facetKey,
        value: s.pattern,
        isPattern: true,
      };
      if (s.negated) tok.negated = true;
      appendToken(tok);
      return;
    }
    if (s.kind === "range") {
      const tok: Token = {
        id: nextTokenId(),
        facetKey: s.facetKey,
        value: s.value,
        op: s.op,
      };
      if (s.negated) tok.negated = true;
      appendToken(tok);
      return;
    }
    if (s.kind === "invalid") {
      // Non-committable feedback row — no-op.
      return;
    }
    if (s.kind === "saved") {
      // Restore the full query state — tokens/advanced AND aggregation.
      // Advanced views re-parse the raw text via parseQuery so the AST is
      // rebuilt; if the parse fails (schema drift), fall back to an empty
      // simple query rather than silently corrupting state.
      if (s.advancedText) {
        const result = parseQuery(s.advancedText, facets);
        if (result.query) {
          setQuery(result.query);
        } else {
          setQuery(EMPTY_QUERY);
        }
      } else {
        setQuery({
          mode: "simple",
          tokens: s.tokens.map((t) => ({ ...t, id: nextTokenId() })),
        });
      }
      setAggregationRaw(s.aggregation);
      setInputValueRaw("");
      return;
    }
    // recent — replace tokens; recents don't carry aggregation.
    setQuery({
      mode: "simple",
      tokens: s.tokens.map((t) => ({ ...t, id: nextTokenId() })),
    });
    setInputValueRaw("");
  }, [appendToken]);

  const commitAt = useCallback(
    (index: number) => {
      let cursor = 0;
      for (const section of sections) {
        if (index < cursor + section.items.length) {
          commit(section.items[index - cursor]);
          return;
        }
        cursor += section.items.length;
      }
    },
    [sections, commit],
  );

  // Liqe-backed entry path: parse the input (or `textOverride`) as a Datadog
  // query. Returns true when the parse produced a non-empty Query and the
  // input was consumed; false on parse failure or empty result, so the
  // caller can fall through to NL or other handling.
  //
  // `textOverride` is for non-input-bound entry points like URL load — when
  // provided, the inputValue is left alone (typed-commit clears it).
  //
  // Merge rules (only the typed-commit path follows these — suggestion /
  // saved / recent / NL paths have their own semantics):
  //   * existing simple + parsed simple → append tokens (back-compat with
  //     today's per-chunk add)
  //   * existing simple + parsed advanced → switch to advanced mode
  //   * existing advanced + parsed * → no-op; user must edit the advanced
  //     chip first to come back to simple-mode-empty
  const commitDraft = useCallback((textOverride?: string): boolean => {
    const text = (textOverride ?? inputValue).trim();
    if (!text) return false;
    const result = parseQuery(text, facets);
    if (!result.query) return false;
    const parsed = result.query;
    if (parsed.mode === "simple" && parsed.tokens.length === 0) return false;

    // Decide synchronously from the closure-captured `query`. The setQuery
    // updater itself does the merge; mutating a flag inside the updater
    // isn't safe since StrictMode invokes it twice in dev (and the timing
    // of the second invocation relative to the post-call statement here
    // makes flag-based control flow racy).
    if (query.mode === "advanced") return false;

    setQuery((prev) => {
      if (prev.mode === "advanced") return prev;
      if (parsed.mode === "advanced") return parsed;
      return {
        mode: "simple",
        tokens: [
          ...prev.tokens,
          ...parsed.tokens.map((t) => ({ ...t, id: nextTokenId() })),
        ],
      };
    });
    if (textOverride === undefined) setInputValueRaw("");
    return true;
  }, [query, inputValue, facets]);

  const removeToken = useCallback((id: string) => {
    setQuery((prev) => {
      if (prev.mode === "advanced") {
        if (id === ADVANCED_CHIP_ID) return EMPTY_QUERY;
        return prev;
      }
      return {
        mode: "simple",
        tokens: prev.tokens.filter((t) => t.id !== id),
      };
    });
  }, []);

  const removeTokensByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setQuery((prev) => {
      if (prev.mode === "advanced") return prev;
      return {
        mode: "simple",
        tokens: prev.tokens.filter((t) => !idSet.has(t.id)),
      };
    });
  }, []);

  const applyTokens = useCallback(
    (newTokens: Token[], nlText?: string) => {
      if (newTokens.length === 0) return;
      const stamped = newTokens.map((t) => ({ ...t, id: t.id || nextTokenId() }));
      // NL / saved / recent paths always coalesce into simple mode. If the
      // user was in advanced mode, this resets to a fresh simple chip set —
      // matching how each of these entry points conceptually starts over.
      setQuery((prev) =>
        prev.mode === "simple"
          ? { mode: "simple", tokens: [...prev.tokens, ...stamped] }
          : { mode: "simple", tokens: stamped },
      );
      setInputValueRaw("");
      // Record this as a recent so users can re-run the same NL query later.
      setRecents((prev) => {
        const serial = serialiseTokens(stamped);
        const dedup = prev.filter(
          (r) => serialiseTokens(r.tokens) !== serial && r.nlText !== nlText,
        );
        const entry: RecentEntry = {
          tokens: stamped.map((t) => ({ ...t })),
          savedAt: Date.now(),
          ...(nlText ? { nlText } : {}),
        };
        return [entry, ...dedup].slice(0, RECENTS_LIMIT);
      });
    },
    [setRecents],
  );

  const setAggregation = useCallback((a: Aggregation | null) => {
    setAggregationRaw(a);
  }, []);

  const applyNLResult = useCallback(
    ({ tokens: newTokens, aggregation: newAgg, nlText }: ApplyNLArgs) => {
      // Stamp new token ids and apply atomically with the aggregation so the
      // table doesn't paint twice. NL always settles into simple mode.
      const stamped = newTokens.map((t) => ({
        ...t,
        id: t.id || nextTokenId(),
      }));
      if (stamped.length > 0) {
        setQuery((prev) =>
          prev.mode === "simple"
            ? { mode: "simple", tokens: [...prev.tokens, ...stamped] }
            : { mode: "simple", tokens: stamped },
        );
      }
      setAggregationRaw(newAgg);
      setInputValueRaw("");
      // Recents only when there's something to record (either new tokens or
      // an aggregation that differs from a pure existing-state snapshot).
      if (stamped.length === 0 && !newAgg) return;
      setRecents((prev) => {
        const serial = serialiseTokens(stamped);
        const dedup = prev.filter(
          (r) => serialiseTokens(r.tokens) !== serial && r.nlText !== nlText,
        );
        const entry: RecentEntry = {
          tokens: stamped.map((t) => ({ ...t })),
          savedAt: Date.now(),
          ...(nlText ? { nlText } : {}),
        };
        return [entry, ...dedup].slice(0, RECENTS_LIMIT);
      });
    },
    [setRecents],
  );

  const editLastToken = useCallback(() => {
    setQuery((prev) => {
      if (prev.mode === "advanced") {
        // Whole-query edit: text back into input, clear query so subsequent
        // typing / Enter follows the simple-empty path.
        setInputValueRaw(prev.text);
        return EMPTY_QUERY;
      }
      if (prev.tokens.length === 0) return prev;
      const last = prev.tokens[prev.tokens.length - 1];
      setInputValueRaw(serialiseToken(last));
      return { mode: "simple", tokens: prev.tokens.slice(0, -1) };
    });
  }, []);

  const editToken = useCallback((id: string) => {
    setQuery((prev) => {
      if (prev.mode === "advanced") {
        if (id !== ADVANCED_CHIP_ID) return prev;
        setInputValueRaw(prev.text);
        return EMPTY_QUERY;
      }
      const idx = prev.tokens.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      setInputValueRaw(serialiseToken(prev.tokens[idx]));
      return {
        mode: "simple",
        tokens: [...prev.tokens.slice(0, idx), ...prev.tokens.slice(idx + 1)],
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setQuery(EMPTY_QUERY);
    setInputValueRaw("");
    setAggregationRaw(null);
  }, []);

  const saveCurrentAsRecent = useCallback(() => {
    setRecents((prev) => {
      // Recents only stores simple-mode chip lists today. Advanced-mode
      // saved views are the right home for advanced queries (saveable by
      // name); we don't auto-snapshot advanced text into recents to keep
      // the recents list focused on the chip-friendly form.
      if (query.mode === "advanced") return prev;
      const tokenList = query.tokens;
      if (tokenList.length === 0) return prev;
      const serial = serialiseTokens(tokenList);
      const dedup = prev.filter((r) => serialiseTokens(r.tokens) !== serial);
      const entry: RecentEntry = {
        tokens: tokenList.map((t) => ({ ...t })),
        savedAt: Date.now(),
      };
      return [entry, ...dedup].slice(0, RECENTS_LIMIT);
    });
  }, [query, setRecents]);

  return {
    query,
    tokens,
    inputValue,
    setInputValue,
    draft,
    filteredRows,
    sections,
    itemCount,
    facetByKey,
    commitAt,
    commit,
    commitDraft,
    removeToken,
    removeTokensByIds,
    applyTokens,
    applyNLResult,
    aggregation,
    setAggregation,
    topN,
    editLastToken,
    editToken,
    clearAll,
    saveCurrentAsRecent,
    recents,
    matchedSavedView,
  };
}

// Secondary label for a saved-view dropdown row. Priority:
//   1. nlText (the original NL prompt) — preserves intent for AI searches
//   2. advancedText (raw cross-facet OR / nested AND-OR query)
//   3. tokens + " · " + agg summary — for hybrid views
//   4. tokens alone — classic filter views
//   5. agg summary alone — agg-only views
function savedViewLabel<T>(
  view: SavedView,
  facetByKey: Map<string, FacetConfig<T>>,
): string {
  if (view.nlText) return view.nlText;
  if (view.advancedText) return view.advancedText;
  const tokenPart = view.tokens.length > 0 ? serialiseTokens(view.tokens) : "";
  const aggPart = view.aggregation
    ? aggregationSummary(
        view.aggregation,
        facetByKey.get(view.aggregation.groupBy)?.label,
      )
    : "";
  if (tokenPart && aggPart) return `${tokenPart} · ${aggPart}`;
  return tokenPart || aggPart;
}

const VALID_OPS: ReadonlySet<string> = new Set([">", ">=", "<", "<=", ".."]);

// Module-scope so identities are stable across renders — required by
// useLocalStorage to avoid re-render loops.
function serialiseRecents(recents: RecentEntry[]): string {
  const minimal = recents.map((entry) => ({
    tokens: entry.tokens.map(({ facetKey, value, isPattern, negated, op }) => ({
      facetKey,
      value,
      ...(isPattern ? { isPattern: true } : {}),
      ...(negated ? { negated: true } : {}),
      ...(op ? { op } : {}),
    })),
    savedAt: entry.savedAt,
    ...(entry.nlText ? { nlText: entry.nlText } : {}),
  }));
  return JSON.stringify(minimal);
}

function deserialiseRecents(raw: string): RecentEntry[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const out: RecentEntry[] = [];
    for (const item of parsed) {
      // Legacy v1: a Token[] (pre-savedAt). New v2: { tokens, savedAt }.
      const isLegacy = Array.isArray(item);
      const rawTokens: unknown[] = isLegacy
        ? item
        : Array.isArray(item?.tokens)
          ? item.tokens
          : [];
      const tokens = rawTokens
        .filter(
          (t): t is {
            facetKey: string;
            value: string;
            isPattern?: boolean;
            negated?: boolean;
            op?: string;
          } =>
            !!t &&
            typeof t === "object" &&
            typeof (t as { facetKey?: unknown }).facetKey === "string" &&
            typeof (t as { value?: unknown }).value === "string",
        )
        .map((t) => {
          const tok: Token = { id: nextTokenId(), facetKey: t.facetKey, value: t.value };
          if (t.isPattern === true) tok.isPattern = true;
          if (t.negated === true) tok.negated = true;
          if (typeof t.op === "string" && VALID_OPS.has(t.op)) tok.op = t.op as Op;
          return tok;
        });
      if (tokens.length === 0) continue;
      const savedAt =
        !isLegacy && typeof item?.savedAt === "number"
          ? item.savedAt
          : Date.now() - 1000 * 60 * 60 * 24 * 7; // legacy → "Nd ago" rather than "just now"
      const nlText =
        !isLegacy && typeof item?.nlText === "string" && item.nlText.trim()
          ? item.nlText
          : undefined;
      out.push(nlText ? { tokens, savedAt, nlText } : { tokens, savedAt });
    }
    return out;
  } catch {
    return [];
  }
}
