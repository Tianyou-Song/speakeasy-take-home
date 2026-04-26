import { useCallback, useEffect, useState } from "react";
import { nextTokenId } from "./parse";
import type { Token } from "./types";

export interface SavedView {
  id: string;
  name: string;
  tokens: Token[];
  savedAt: number;
}

export interface UseSavedViewsResult {
  savedViews: SavedView[];
  saveView: (name: string, tokens: Token[]) => void;
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

  const saveView = useCallback((name: string, tokens: Token[]) => {
    const trimmed = name.trim();
    if (!trimmed || tokens.length === 0) return;
    setSavedViews((prev) => {
      const dedup = prev.filter((v) => v.name !== trimmed);
      const entry: SavedView = {
        id: `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        tokens: tokens.map((t) => ({ ...t })),
        savedAt: Date.now(),
      };
      return [entry, ...dedup].slice(0, SAVED_LIMIT);
    });
  }, []);

  const removeView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return { savedViews, saveView, removeView };
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
      if (tokens.length === 0) continue;
      out.push({
        id:
          typeof item.id === "string"
            ? item.id
            : `view_${Date.now().toString(36)}_${out.length}`,
        name: item.name,
        tokens,
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
    }));
    window.localStorage.setItem(storageKey, JSON.stringify(minimal));
  } catch {
    // localStorage may be disabled
  }
}
