import type { MouseEventHandler } from "react";

interface AskButtonProps {
  onClick: () => void;
  state: "idle" | "armed" | "loading" | "parsing" | "unavailable";
  disabledReason?: string;
}

const SPARKLE_PATH =
  "M12 3l1.9 4.9L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-2.1L12 3zm6 11l1 2.5L21.5 17 19 18l-1 2.5L17 18l-2.5-1L17 16l1-2zm-12 .5l.7 1.8L8.5 17l-1.8.7L6 19.5 5.3 17.7 3.5 17l1.8-.7L6 14.5z";

export function AskButton({ onClick, state, disabledReason }: AskButtonProps) {
  const disabled = state === "unavailable";
  const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    onClick();
  };

  const active = state === "armed" || state === "loading" || state === "parsing";

  return (
    <button
      type="button"
      data-testid="facet-search-ask"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label="Search with natural language"
      title={
        disabled
          ? (disabledReason ??
            "Natural language search isn't available in this browser.")
          : "Search with natural language (or press Space)"
      }
      className={[
        "flex-shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        "transition-all duration-150 select-none",
        disabled
          ? "cursor-not-allowed opacity-40 text-zinc-500 border border-zinc-800/60"
          : active
            ? "bg-violet-500/20 text-violet-100 border border-violet-400/50 ring-2 ring-violet-500/30"
            : "bg-violet-500/10 text-violet-200 border border-violet-400/30 hover:bg-violet-500/20 hover:text-violet-100",
      ].join(" ")}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width={12}
        height={12}
        className="shrink-0 fill-current"
      >
        <path d={SPARKLE_PATH} />
      </svg>
      <span className="hidden sm:inline">Ask</span>
    </button>
  );
}
