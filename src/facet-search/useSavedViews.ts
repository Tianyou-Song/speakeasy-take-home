import { useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";
import { nextTokenId } from "./parse";
import type { Aggregation, Op, Token } from "./types";

const VALID_OPS: ReadonlySet<string> = new Set([">", ">=", "<", "<=", ".."]);

export interface SavedView {
  id: string;
  name: string;
  tokens: Token[];
  // Aggregation state captured at save time, so loading restores the full
  // reproducible query — not just the filter tokens. Null means no agg.
  aggregation: Aggregation | null;
  // Original NL prompt that produced this view, when applicable. Used as the
  // human-readable label in the dropdown and as the default name suggestion.
  nlText?: string;
  // Advanced-mode source text (cross-facet OR / nested AND-OR / etc that
  // doesn't flatten to a chip-friendly token list). When present, `tokens`
  // is empty and the view is restored by re-parsing this text. Saved views
  // are the only persistence surface that retains advanced queries; recents
  // store the simple chip form.
  advancedText?: string;
  savedAt: number;
}

export interface UseSavedViewsResult {
  savedViews: SavedView[];
  saveView: (
    name: string,
    tokens: Token[],
    aggregation: Aggregation | null,
    nlText?: string,
    advancedText?: string,
  ) => void;
  renameView: (id: string, name: string) => void;
  removeView: (id: string) => void;
}

const SAVED_LIMIT = 12;

export function useSavedViews(storageKey: string): UseSavedViewsResult {
  const [savedViews, setSavedViews] = useLocalStorage<SavedView[]>(
    storageKey,
    [],
    {
      serializer: serialiseViews,
      deserializer: deserialiseViews,
      initializeWithValue: typeof window !== "undefined",
    },
  );

  const saveView = useCallback(
    (
      name: string,
      tokens: Token[],
      aggregation: Aggregation | null,
      nlText?: string,
      advancedText?: string,
    ) => {
      const trimmed = name.trim();
      // Allow agg-only saves (no tokens) AND advanced-text-only saves so NL
      // aggregations and cross-facet OR queries are both saveable.
      if (
        !trimmed ||
        (tokens.length === 0 && !aggregation && !advancedText)
      ) {
        return;
      }
      setSavedViews((prev) => {
        const dedup = prev.filter((v) => v.name !== trimmed);
        const entry: SavedView = {
          id: `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: trimmed,
          tokens: tokens.map((t) => ({ ...t })),
          aggregation: aggregation ? { ...aggregation } : null,
          ...(nlText ? { nlText } : {}),
          ...(advancedText ? { advancedText } : {}),
          savedAt: Date.now(),
        };
        return [entry, ...dedup].slice(0, SAVED_LIMIT);
      });
    },
    [setSavedViews],
  );

  const renameView = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setSavedViews((prev) =>
        prev.map((v) => (v.id === id ? { ...v, name: trimmed } : v)),
      );
    },
    [setSavedViews],
  );

  const removeView = useCallback(
    (id: string) => {
      setSavedViews((prev) => prev.filter((v) => v.id !== id));
    },
    [setSavedViews],
  );

  return { savedViews, saveView, renameView, removeView };
}

// Module-scope so identities are stable across renders — required by
// useLocalStorage to avoid re-render loops.
function serialiseViews(views: SavedView[]): string {
  const minimal = views.map((v) => ({
    id: v.id,
    name: v.name,
    savedAt: v.savedAt,
    tokens: v.tokens.map(({ facetKey, value, isPattern, negated, op }) => ({
      facetKey,
      value,
      ...(isPattern ? { isPattern: true } : {}),
      ...(negated ? { negated: true } : {}),
      ...(op ? { op } : {}),
    })),
    aggregation: v.aggregation,
    ...(v.nlText ? { nlText: v.nlText } : {}),
    ...(v.advancedText ? { advancedText: v.advancedText } : {}),
  }));
  return JSON.stringify(minimal);
}

function deserialiseViews(raw: string): SavedView[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedView[] = [];
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.name !== "string" ||
        !Array.isArray(item.tokens)
      ) {
        continue;
      }
      const tokens = (item.tokens as unknown[])
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
      const aggregation = parseAggregation(item.aggregation);
      const advancedText =
        typeof item.advancedText === "string" && item.advancedText.trim().length > 0
          ? item.advancedText
          : undefined;
      // Skip only views with no payload at all — empty views are noise.
      if (tokens.length === 0 && !aggregation && !advancedText) continue;
      const nlText =
        typeof item.nlText === "string" && item.nlText.trim().length > 0
          ? item.nlText
          : undefined;
      out.push({
        id:
          typeof item.id === "string"
            ? item.id
            : `view_${Date.now().toString(36)}_${out.length}`,
        name: item.name,
        tokens,
        aggregation,
        ...(nlText ? { nlText } : {}),
        ...(advancedText ? { advancedText } : {}),
        savedAt:
          typeof item.savedAt === "number" ? item.savedAt : Date.now(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseAggregation(raw: unknown): Aggregation | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (
    typeof a.groupBy !== "string" ||
    a.aggregator !== "count" ||
    (a.orderBy !== "count_desc" && a.orderBy !== "count_asc") ||
    typeof a.limit !== "number" ||
    !Number.isFinite(a.limit)
  ) {
    return null;
  }
  return {
    groupBy: a.groupBy,
    aggregator: "count",
    orderBy: a.orderBy,
    limit: Math.max(1, Math.min(20, Math.floor(a.limit))),
  };
}
