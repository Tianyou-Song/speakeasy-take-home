import { useEffect, useRef, useState } from "react";

interface NLPillProps {
  query: string;
  onUndo: () => void;
  onEditPrompt: () => void;
  onDismiss: () => void;
  // Auto-dismiss after this many ms unless hovered.
  dismissMs?: number;
}

const DEFAULT_DISMISS_MS = 6000;

export function NLPill({
  query,
  onUndo,
  onEditPrompt,
  onDismiss,
  dismissMs = DEFAULT_DISMISS_MS,
}: NLPillProps) {
  const [paused, setPaused] = useState(false);
  // Visual progress of the auto-dismiss timer (0 -> 1 in dismissMs).
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number>(performance.now());
  const remainingRef = useRef<number>(dismissMs);
  const rafRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const tick = () => {
      if (paused) return;
      const now = performance.now();
      const ms = now - startedRef.current;
      const e = Math.min(1, ms / dismissMs);
      setElapsed(e);
      if (e >= 1) {
        onDismissRef.current();
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [paused, dismissMs]);

  const handleEnter = () => {
    if (paused) return;
    setPaused(true);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    // Capture remaining time so we can resume from where we left off.
    remainingRef.current = Math.max(
      0,
      dismissMs - (performance.now() - startedRef.current),
    );
  };
  const handleLeave = () => {
    if (!paused) return;
    setPaused(false);
    startedRef.current = performance.now() - (dismissMs - remainingRef.current);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className="relative mt-1.5 flex items-center gap-2 overflow-hidden rounded-md border border-violet-500/30 bg-violet-500/5 px-2.5 py-1 text-xs"
      data-testid="nl-pill"
    >
      <span aria-hidden className="text-violet-300">
        <Sparkle />
      </span>
      <span className="text-violet-200/80">Translated</span>
      <span className="truncate font-mono text-violet-100" title={query}>
        “{query}”
      </span>
      <span className="ml-auto inline-flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onEditPrompt}
          className="rounded px-1.5 py-0.5 text-[11px] text-violet-200 hover:bg-violet-500/15 hover:text-violet-100"
        >
          Edit prompt
        </button>
        <span aria-hidden className="text-violet-500/30">|</span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onUndo}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-violet-100 hover:bg-violet-500/20"
        >
          Undo
        </button>
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] origin-left bg-violet-400/40 motion-reduce:hidden"
        style={{ transform: `scaleX(${1 - elapsed})` }}
      />
    </div>
  );
}

function Sparkle() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={12} height={12} className="fill-current">
      <path d="M12 3l1.9 4.9L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-2.1L12 3z" />
    </svg>
  );
}
