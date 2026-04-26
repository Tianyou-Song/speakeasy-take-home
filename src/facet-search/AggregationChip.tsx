import { Icon } from "@speakeasy-api/moonshine";
import type { KeyboardEventHandler, MouseEventHandler, Ref } from "react";
import type { Aggregation, FacetConfig } from "./types";

interface AggregationChipProps<T> {
  aggregation: Aggregation;
  facet: FacetConfig<T> | undefined;
  onRemove: () => void;
  // Roving-focus props (parity with FacetChip).
  isFocused?: boolean;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  chipRef?: Ref<HTMLDivElement>;
}

export function AggregationChip<T>({
  aggregation,
  facet,
  onRemove,
  isFocused,
  tabIndex,
  onKeyDown,
  chipRef,
}: AggregationChipProps<T>) {
  const handleRemove: MouseEventHandler = (e) => {
    e.stopPropagation();
    onRemove();
  };
  const groupLabel = facet?.label ?? aggregation.groupBy;
  const direction = aggregation.orderBy === "count_asc" ? "least" : "top";
  const limitLabel = aggregation.limit === 1 ? "" : `${aggregation.limit} `;
  const ariaLabel = `${direction === "top" ? "Top" : "Least"} ${aggregation.limit} by ${groupLabel}`;
  return (
    <div
      ref={chipRef}
      role="button"
      tabIndex={tabIndex ?? -1}
      aria-pressed={isFocused ? true : undefined}
      aria-label={ariaLabel}
      className={[
        "group inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
        "text-xs font-medium leading-5 cursor-pointer select-none transition-colors shrink-0",
        "border-violet-400/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15",
        "outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950",
      ].join(" ")}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      title={`${ariaLabel} (count) — click × or press Backspace to remove`}
      data-testid={`aggregation-chip-${aggregation.groupBy}`}
    >
      <span aria-hidden className="text-violet-300">
        <BarChartIcon />
      </span>
      <span className="text-violet-300/80 font-mono tracking-tight">
        {direction === "top" ? "Top" : "Least"}
      </span>
      <span className="font-mono tracking-tight">
        {limitLabel}by {groupLabel}
      </span>
      <button
        type="button"
        aria-label={`Remove ${groupLabel} ranking`}
        className="-mr-0.5 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-white/10 transition-opacity"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleRemove}
        tabIndex={-1}
      >
        <Icon name="x" size="small" />
      </button>
    </div>
  );
}

function BarChartIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={11}
      height={11}
      className="fill-current"
    >
      <rect x="3" y="13" width="3" height="8" rx="0.5" />
      <rect x="9" y="9" width="3" height="12" rx="0.5" />
      <rect x="15" y="5" width="3" height="16" rx="0.5" />
    </svg>
  );
}
