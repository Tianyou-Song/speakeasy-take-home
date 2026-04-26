import type { FacetConfig } from "../types";
import { llmEngine } from "./llm";
import type { NLEngineStatus, NLProgressCallback, NLResult } from "./types";

export { detectWebGPU } from "./capability";
export { EXAMPLE_NL_QUERIES } from "./examples";
export type {
  NLEngine,
  NLEngineStatus,
  NLLoadProgress,
  NLProgressCallback,
  NLResult,
} from "./types";

export async function parseNL<T>(
  text: string,
  facets: FacetConfig<T>[],
): Promise<NLResult> {
  return llmEngine.parse(text, facets);
}

export async function warmupNL(): Promise<void> {
  return llmEngine.warmup();
}

export function getNLEngineStatus(): NLEngineStatus {
  return llmEngine.status;
}

export function subscribeNLProgress(cb: NLProgressCallback): () => void {
  return llmEngine.subscribeProgress(cb);
}
