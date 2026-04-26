import { useState } from "react";

interface NLLoadingProgressProps {
  // 0..1
  progress: number;
  etaSec?: number;
  // Verbose status from WebLLM (e.g. "Fetching param cache[42/62]: 1629MB...")
  detail?: string;
  // True iff this is the very first model load on this origin — drives the
  // "First-time setup … cached for next time" subtitle.
  isFirstLoad?: boolean;
  // Bytes downloaded so far (parsed from WebLLM telemetry; may be missing).
  bytesLoaded?: number;
  // Total bytes expected (per-model lookup; may be missing).
  bytesTotal?: number;
}

export function NLLoadingProgress({
  progress,
  etaSec,
  detail,
  isFirstLoad,
  bytesLoaded,
  bytesTotal,
}: NLLoadingProgressProps) {
  const [showDetails, setShowDetails] = useState(false);
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  const etaLabel = formatEta(etaSec);
  const bytesLabel = formatBytes(bytesLoaded, bytesTotal);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden px-1"
      data-testid="nl-loading-progress"
    >
      <div className="flex min-w-0 items-center gap-2 text-xs text-violet-200">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
          <SparkleSpin />
          <span>Loading AI</span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-violet-300/80">
          {pct}%
        </span>
        {etaLabel && (
          <>
            <span className="shrink-0 font-mono text-[11px] text-zinc-500">
              ·
            </span>
            <span className="shrink-0 font-mono text-[11px] text-zinc-400">
              {etaLabel}
            </span>
          </>
        )}
        {bytesLabel && (
          <>
            <span className="hidden shrink-0 font-mono text-[11px] text-zinc-500 sm:inline">
              ·
            </span>
            <span className="hidden shrink-0 font-mono text-[11px] text-zinc-400 sm:inline">
              {bytesLabel}
            </span>
          </>
        )}
        {detail && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            aria-controls="nl-loading-detail"
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          >
            Details {showDetails ? "▴" : "▾"}
          </button>
        )}
      </div>

      <div
        className="h-[3px] w-full overflow-hidden rounded-full bg-violet-500/10"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-violet-400 to-fuchsia-400 transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {isFirstLoad && (
        <p className="text-[10.5px] text-zinc-500">
          First-time setup — cached for next time. Stay on this tab.
        </p>
      )}

      {showDetails && detail && (
        <p
          id="nl-loading-detail"
          className="min-w-0 truncate font-mono text-[10.5px] text-zinc-500"
          title={detail}
        >
          {detail}
        </p>
      )}
    </div>
  );
}

function formatEta(etaSec?: number): string | null {
  if (etaSec === undefined || !Number.isFinite(etaSec)) return null;
  if (etaSec <= 0) return null;
  if (etaSec >= 60) return `~${Math.round(etaSec / 60)}m`;
  return `~${etaSec}s`;
}

function formatBytes(loaded?: number, total?: number): string | null {
  if (loaded === undefined && total === undefined) return null;
  const fmt = (b: number): string => {
    if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
    if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
    if (b >= 1024) return `${Math.round(b / 1024)} KB`;
    return `${b} B`;
  };
  if (loaded !== undefined && total !== undefined) {
    return `${fmt(loaded)} / ${fmt(total)}`;
  }
  if (total !== undefined) return `${fmt(total)} total`;
  return loaded !== undefined ? fmt(loaded) : null;
}

function SparkleSpin() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={12}
      height={12}
      className="shrink-0 fill-current motion-safe:animate-pulse"
    >
      <path d="M12 3l1.9 4.9L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-2.1L12 3z" />
    </svg>
  );
}
