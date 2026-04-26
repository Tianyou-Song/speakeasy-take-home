import { useCallback, useEffect, useState } from "react";
import { nextTokenId } from "./parse";
import type { Aggregation, Token } from "./types";

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
  savedAt: number;
}

export interface UseSavedViewsResult {
  savedViews: SavedView[];
  saveView: (
    name: string,
    tokens: Token[],
    aggregation: Aggregation | null,
    nlText?: string,
  ) => void;
  renameView: (id: string, name: string) => void;
  removeView: (id: string) => void;
}

const SAVED_LIMIT = 12;

export function useSavedViews(storageKey: string): UseSavedViewsResult {
  const [savedViews, setSavedViews] = useState<SavedView[]>(() =>
    loadSaved(storageKey),
  );

  useEffect(() => {
    saveAll(storageKey, savedViews);
  }, [storageKey, savedViews]);

  const saveView = useCallback(
    (
      name: string,
      tokens: Token[],
      aggregation: Aggregation | null,
      nlText?: string,
    ) => {
      const trimmed = name.trim();
      // Allow agg-only saves (no tokens) so NL aggregation queries are saveable.
      if (!trimmed || (tokens.length === 0 && !aggregation)) return;
      setSavedViews((prev) => {
        const dedup = prev.filter((v) => v.name !== trimmed);
        const entry: SavedView = {
          id: `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: trimmed,
          tokens: tokens.map((t) => ({ ...t })),
          aggregation: aggregation ? { ...aggregation } : null,
          ...(nlText ? { nlText } : {}),
          savedAt: Date.now(),
        };
        return [entry, ...dedup].slice(0, SAVED_LIMIT);
      });
    },
    [],
  );

  const renameView = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavedViews((prev) =>
      prev.map((v) => (v.id === id ? { ...v, name: trimmed } : v)),
    );
  }, []);

  const removeView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return { savedViews, saveView, renameView, removeView };
}

function loadSaved(storageKey: string): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
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
      const aggregation = parseAggregation(item.aggregation);
      // Skip only views with neither tokens nor aggregation — empty views are noise.
      if (tokens.length === 0 && !aggregation) continue;
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
        savedAt:
          typeof item.savedAt === "number" ? item.savedAt : Date.now(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function saveAll(storageKey: string, views: SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    const minimal = views.map((v) => ({
      id: v.id,
      name: v.name,
      savedAt: v.savedAt,
      tokens: v.tokens.map(({ facetKey, value, isPattern }) =>
        isPattern ? { facetKey, value, isPattern } : { facetKey, value },
      ),
      aggregation: v.aggregation,
      ...(v.nlText ? { nlText: v.nlText } : {}),
    }));
    window.localStorage.setItem(storageKey, JSON.stringify(minimal));
  } catch {
    // localStorage may be disabled
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
