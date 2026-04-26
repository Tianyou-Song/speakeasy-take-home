import type { Aggregation, Token } from "../types";

export type NLEngineStatus = "cold" | "loading" | "ready" | "failed";

export interface NLLoadProgress {
  progress: number; // 0..1
  text: string;     // raw WebLLM detail (Details expander)
  etaSec?: number;
  // True when the model has not previously been loaded on this origin
  // (no `nl:loaded:v1` flag in localStorage). Used to surface a one-time
  // "First-time setup …" subtitle.
  isFirstLoad: boolean;
  // Bytes downloaded so far, parsed from WebLLM's verbose `text`.
  // Optional — silently absent if the message format changes.
  bytesLoaded?: number;
  // Total bytes the model is expected to download. Hardcoded per-model lookup;
  // optional in case the model id isn't in the table.
  bytesTotal?: number;
}

export type NLProgressCallback = (p: NLLoadProgress) => void;

export interface NLResult {
  tokens: Token[];
  aggregation: Aggregation | null;
}

// Validation only needs the facet keys, so accept the structural minimum.
export type NLFacetSchema = ReadonlyArray<{ key: string }>;

export interface NLEngine {
  readonly status: NLEngineStatus;
  warmup(): Promise<void>;
  parse(text: string, facets: NLFacetSchema): Promise<NLResult>;
  subscribeProgress(cb: NLProgressCallback): () => void;
}
