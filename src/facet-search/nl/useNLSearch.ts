import { useCallback, useEffect, useRef, useState } from "react";
import type { Aggregation, FacetConfig, Token } from "../types";
import { detectWebGPU } from "./capability";
import {
  getNLEngineStatus,
  parseNL,
  subscribeNLProgress,
  warmupNL,
} from "./index";
import type { NLLoadProgress } from "./types";

export type NLStatus =
  | "checking"
  | "idle"
  | "armed"
  | "loading"
  | "parsing"
  | "applied"
  | "failed"
  | "unavailable";

export interface NLState {
  status: NLStatus;
  loadProgress: NLLoadProgress | null;
  lastQuery: string;
  lastAppliedTokenIds: string[];
  // The aggregation that was active before the most recent apply, so Undo
  // can restore it (typically null, but supports re-applying NL on top of NL).
  prevAggregation: Aggregation | null;
}

export interface UseNLSearchArgs<T> {
  facets: FacetConfig<T>[];
  onApply: (
    tokens: Token[],
    aggregation: Aggregation | null,
    originalQuery: string,
  ) => void;
  // Read the current aggregation so Undo can restore the prior one.
  getCurrentAggregation: () => Aggregation | null;
}

export interface UseNLSearchResult {
  nlState: NLState;
  available: boolean;
  arm: () => void;
  disarm: () => void;
  submit: (text: string) => Promise<void>;
  dismissApplied: () => void;
}

export function useNLSearch<T>({
  facets,
  onApply,
  getCurrentAggregation,
}: UseNLSearchArgs<T>): UseNLSearchResult {
  const [nlState, setNLState] = useState<NLState>({
    status: "checking",
    loadProgress: null,
    lastQuery: "",
    lastAppliedTokenIds: [],
    prevAggregation: null,
  });
  const facetsRef = useRef(facets);
  facetsRef.current = facets;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const getAggRef = useRef(getCurrentAggregation);
  getAggRef.current = getCurrentAggregation;

  // One-shot WebGPU capability check. Drives the unavailable state, and —
  // when the browser supports it — kicks off an *eager* background warmup so
  // the model is already (or nearly) ready by the time the user makes their
  // first NL gesture. Mirrors Datadog's always-warm server LLM mental model.
  // The download is silent: nlState.status stays "idle" while shards stream,
  // and the existing submit() path correctly shows the bar if the user beats
  // the download to completion.
  useEffect(() => {
    let cancelled = false;
    detectWebGPU().then((ok) => {
      if (cancelled) return;
      setNLState((prev) =>
        prev.status === "checking"
          ? { ...prev, status: ok ? "idle" : "unavailable" }
          : prev,
      );
      if (!ok) return;

      // Defer to idle so we don't fight first paint / Vite HMR / table render.
      // 1s timeout guarantees the warmup actually fires even on a busy thread.
      const trigger = () => {
        if (cancelled) return;
        void warmupNL().catch((e) => {
          console.warn("[NL] background warmup failed:", e);
          setNLState((prev) =>
            prev.status === "idle"
              ? { ...prev, status: "unavailable" }
              : prev,
          );
        });
      };
      type RIC = (cb: () => void, opts?: { timeout?: number }) => number;
      const w = window as Window & { requestIdleCallback?: RIC };
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(trigger, { timeout: 1000 });
      } else {
        window.setTimeout(trigger, 200);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reflect engine load progress into local state so the input bar can render
  // the loading bar.
  useEffect(() => {
    return subscribeNLProgress((p) => {
      setNLState((prev) => ({ ...prev, loadProgress: p }));
    });
  }, []);

  const arm = useCallback(() => {
    setNLState((prev) => {
      if (prev.status === "unavailable") return prev;
      return { ...prev, status: "armed" };
    });
    // Idempotent — kicks off model load if not already started.
    void warmupNL().catch((e) => {
      console.warn("[NL] warmup failed:", e);
      setNLState((prev) => ({ ...prev, status: "unavailable" }));
    });
  }, []);

  const disarm = useCallback(() => {
    setNLState((prev) => {
      if (prev.status === "unavailable") return prev;
      return { ...prev, status: "idle" };
    });
  }, []);

  const submit = useCallback(async (text: string) => {
    const query = text.trim();
    if (!query) return;
    setNLState((prev) => {
      if (prev.status === "unavailable") return prev;
      const engineStatus = getNLEngineStatus();
      return {
        ...prev,
        status: engineStatus === "ready" ? "parsing" : "loading",
        lastQuery: query,
      };
    });

    try {
      const result = await parseNL(query, facetsRef.current);
      // Treat as failure only when neither tokens nor aggregation came back.
      if (result.tokens.length === 0 && !result.aggregation) {
        setNLState((prev) => ({ ...prev, status: "failed" }));
        return;
      }
      const ids = result.tokens.map((t) => t.id);
      const prevAgg = getAggRef.current();
      onApplyRef.current(result.tokens, result.aggregation, query);
      setNLState((prev) => ({
        ...prev,
        status: "applied",
        lastAppliedTokenIds: ids,
        prevAggregation: prevAgg,
      }));
    } catch (e) {
      console.warn("[NL] parse threw:", e);
      setNLState((prev) => ({
        ...prev,
        status: getNLEngineStatus() === "failed" ? "unavailable" : "failed",
      }));
    }
  }, []);

  const dismissApplied = useCallback(() => {
    setNLState((prev) => {
      if (prev.status === "unavailable") return prev;
      return {
        ...prev,
        status: "idle",
        lastAppliedTokenIds: [],
        prevAggregation: null,
      };
    });
  }, []);

  return {
    nlState,
    available: nlState.status !== "unavailable" && nlState.status !== "checking",
    arm,
    disarm,
    submit,
    dismissApplied,
  };
}
