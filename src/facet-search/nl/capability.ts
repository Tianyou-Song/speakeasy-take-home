// Memoized one-shot WebGPU capability check. Returns false if `navigator.gpu`
// is missing, the adapter request returns null, or the call throws.
//
// Industry convention: detect early so the UI can render the "AI unavailable"
// state on first paint instead of disabling on first user gesture.

type NavigatorWithGPU = Navigator & {
  gpu?: { requestAdapter: () => Promise<unknown> };
};

let cached: Promise<boolean> | null = null;

export function detectWebGPU(): Promise<boolean> {
  if (cached) return cached;
  cached = (async () => {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as NavigatorWithGPU;
    if (!nav.gpu) return false;
    try {
      const adapter = await nav.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  })();
  return cached;
}

// Test-only escape hatch.
export function _resetWebGPUCache(): void {
  cached = null;
}
