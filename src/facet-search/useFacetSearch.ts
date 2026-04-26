import { useCallback, useEffect, useMemo, useState } from "react";
import { fuzzyMatch } from "./match";
import { nextTokenId, parseDraft } from "./parse";
import { compilePatternRegex, filterRows, uniqueValuesForFacet } from "./filter";
import {
  isPatternFacet,
  isPatternValue,
  serialiseTokens,
  type Draft,
  type FacetConfig,
  type MatchedSuggestion,
  type Token,
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
      match?: MatchedSuggestion;
    }
  | {
      kind: "pattern";
      id: string;
      facetKey: string;
      pattern: string;
      matchCount: number;
      rowCount: number;
    }
  | {
      kind: "recent";
      id: string;
      tokens: Token[];
      label: string;
      savedAt: number;
    }
  | {
      kind: "saved";
      id: string;
      viewId: string;
      name: string;
      tokens: Token[];
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
}

export interface UseFacetSearchResult<T> {
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
  removeToken: (id: string) => void;
  editLastToken: () => void;
  editToken: (id: string) => void;
  clearAll: () => void;
  saveCurrentAsRecent: () => void;
  recents: RecentEntry[];
}

const RECENTS_LIMIT = 6;
const DEFAULT_STORAGE_KEY = "facet-search:recents:v1";

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
  const [tokens, setTokens] = useState<Token[]>([]);
  const [inputValue, setInputValueRaw] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>(() => loadRecents(storageKey));

  useEffect(() => {
    saveRecents(storageKey, recents);
  }, [recents, storageKey]);

  const draft = useMemo(() => parseDraft(inputValue, facets), [inputValue, facets]);

  const facetByKey = useMemo(
    () => new Map<string, FacetConfig<T>>(facets.map((f) => [f.key, f])),
    [facets],
  );

  const filteredRows = useMemo(
    () => filterRows(rows, tokens, facetByKey),
    [rows, tokens, facetByKey],
  );

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
            label: serialiseTokens(view.tokens),
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
          })),
        });
      }
    } else {
      const facet = facetByKey.get(draft.facetKey);
      if (facet) {
        const all = uniquesByFacet.get(draft.facetKey) ?? [];
        const items: Suggestion[] = [];
        const partial = draft.partial;
        const wildcardActive = isPatternValue(partial) && isPatternFacet(facet);

        if (wildcardActive) {
          const re = compilePatternRegex(partial);
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
            id: `pattern:${facet.key}:${partial}`,
            facetKey: facet.key,
            pattern: partial,
            matchCount,
            rowCount,
          });
        }

        for (const { value, count } of all) {
          const m = partial ? fuzzyMatch(partial, value) : { score: 0, ranges: [] };
          if (m == null) continue;
          items.push({
            kind: "value",
            id: `value:${facet.key}:${value}`,
            facetKey: facet.key,
            value,
            count,
            match: partial ? { key: value, score: m.score, ranges: m.ranges } : undefined,
          });
        }
        if (partial && !wildcardActive) items.sort(byMatchScoreDesc);
        else if (partial && wildcardActive) {
          const [first, ...rest] = items;
          rest.sort(byMatchScoreDesc);
          items.length = 0;
          items.push(first, ...rest);
        }
        out.push({
          id: `values:${facet.key}`,
          heading: `${facet.label} values`,
          items,
        });
      }
    }

    return out;
  }, [draft, facets, recents, facetByKey, uniquesByFacet]);

  const itemCount = useMemo(
    () => sections.reduce((acc, s) => acc + s.items.length, 0),
    [sections],
  );

  const setInputValue = useCallback((next: string) => setInputValueRaw(next), []);

  const commit = useCallback((s: Suggestion) => {
    if (s.kind === "facet") {
      setInputValueRaw(`${s.facetKey}:`);
      return;
    }
    if (s.kind === "value") {
      setTokens((prev) => [...prev, { id: nextTokenId(), facetKey: s.facetKey, value: s.value }]);
      setInputValueRaw("");
      return;
    }
    if (s.kind === "pattern") {
      setTokens((prev) => [
        ...prev,
        { id: nextTokenId(), facetKey: s.facetKey, value: s.pattern, isPattern: true },
      ]);
      setInputValueRaw("");
      return;
    }
    // recent or saved — both replace tokens with their preset
    setTokens(s.tokens.map((t) => ({ ...t, id: nextTokenId() })));
    setInputValueRaw("");
  }, []);

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

  const removeToken = useCallback((id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const editLastToken = useCallback(() => {
    setTokens((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setInputValueRaw(`${last.facetKey}:${last.value}`);
      return prev.slice(0, -1);
    });
  }, []);

  const editToken = useCallback((id: string) => {
    setTokens((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const tok = prev[idx];
      setInputValueRaw(`${tok.facetKey}:${tok.value}`);
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  const clearAll = useCallback(() => {
    setTokens([]);
    setInputValueRaw("");
  }, []);

  const saveCurrentAsRecent = useCallback(() => {
    setRecents((prev) => {
      if (tokens.length === 0) return prev;
      const serial = serialiseTokens(tokens);
      const dedup = prev.filter((r) => serialiseTokens(r.tokens) !== serial);
      const entry: RecentEntry = {
        tokens: tokens.map((t) => ({ ...t })),
        savedAt: Date.now(),
      };
      return [entry, ...dedup].slice(0, RECENTS_LIMIT);
    });
  }, [tokens]);

  return {
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
    removeToken,
    editLastToken,
    editToken,
    clearAll,
    saveCurrentAsRecent,
    recents,
  };
}

function loadRecents(storageKey: string): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
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
          (t): t is { facetKey: string; value: string; isPattern?: boolean } =>
            !!t &&
            typeof t === "object" &&
            typeof (t as { facetKey?: unknown }).facetKey === "string" &&
            typeof (t as { value?: unknown }).value === "string",
        )
        .map((t) => ({
          id: nextTokenId(),
          facetKey: t.facetKey,
          value: t.value,
          ...(t.isPattern ? { isPattern: true } : {}),
        }));
      if (tokens.length === 0) continue;
      const savedAt =
        !isLegacy && typeof item?.savedAt === "number"
          ? item.savedAt
          : Date.now() - 1000 * 60 * 60 * 24 * 7; // legacy → "Nd ago" rather than "just now"
      out.push({ tokens, savedAt });
    }
    return out;
  } catch {
    return [];
  }
}

function saveRecents(storageKey: string, recents: RecentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const minimal = recents.map((entry) => ({
      tokens: entry.tokens.map(({ facetKey, value, isPattern }) =>
        isPattern ? { facetKey, value, isPattern } : { facetKey, value },
      ),
      savedAt: entry.savedAt,
    }));
    window.localStorage.setItem(storageKey, JSON.stringify(minimal));
  } catch {
    // localStorage may be disabled (private mode)
  }
}
