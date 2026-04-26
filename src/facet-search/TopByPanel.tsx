import type {
  Aggregation,
  ChipVariant,
  FacetConfig,
  TopNRow,
} from "./types";
import { resolveChipDisplay, VARIANT_STYLES } from "./types";

interface TopByPanelProps<T> {
  aggregation: Aggregation;
  facet: FacetConfig<T> | undefined;
  rows: TopNRow[];
  totalRows: number;
  onPickValue: (facetKey: string, value: string) => void;
}

export function TopByPanel<T>({
  aggregation,
  facet,
  rows,
  totalRows,
  onPickValue,
}: TopByPanelProps<T>) {
  const groupLabel = facet?.label ?? aggregation.groupBy;
  const direction = aggregation.orderBy === "count_asc" ? "least" : "most";
  const headerLabel = `${direction === "least" ? "Least common" : "Top"} ${rows.length} by ${groupLabel}`;

  if (totalRows === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-3 rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-3 py-3 text-xs text-zinc-500"
        data-testid="topby-panel-empty"
      >
        No rows match the current filter — nothing to aggregate.
      </div>
    );
  }

  const maxCount = rows[0]?.count ?? 1;

  return (
    <div
      role="region"
      aria-label={`${groupLabel} ranking`}
      className="mt-3 overflow-hidden rounded-lg border border-violet-500/20 bg-zinc-950/60"
      data-testid="topby-panel"
    >
      <div className="flex items-center justify-between border-b border-zinc-800/40 px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-violet-300">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <BarIcon />
          {headerLabel}
        </span>
        <span className="font-mono text-zinc-500">
          {totalRows.toLocaleString()} row{totalRows === 1 ? "" : "s"}
        </span>
      </div>
      <ul role="list">
        {rows.map((r) => {
          const { variant, display } = resolveChipDisplay(facet, r.value);
          const widthPct = maxCount > 0 ? (r.count / maxCount) * 100 : 0;
          return (
            <li key={r.value}>
              <button
                type="button"
                onClick={() => onPickValue(aggregation.groupBy, r.value)}
                title={`Filter to ${groupLabel.toLowerCase()}: ${r.value}`}
                className="group relative flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-violet-500/5"
              >
                <BarBackground variant={variant} widthPct={widthPct} />
                <span className="relative z-10 flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <span
                    aria-hidden
                    className={[
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      VARIANT_STYLES[variant].dot,
                    ].join(" ")}
                  />
                  <span className="truncate font-mono text-zinc-200">
                    {display}
                  </span>
                </span>
                <span className="relative z-10 flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-xs text-zinc-300">
                    {r.count}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {Math.round(r.share * 100)}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-zinc-800/40 bg-zinc-950/70 px-3 py-1 text-[10px] text-zinc-500">
        Click a row to add it as a filter chip.
      </div>
    </div>
  );
}

function BarBackground({
  variant,
  widthPct,
}: {
  variant: ChipVariant;
  widthPct: number;
}) {
  const map: Record<ChipVariant, string> = {
    neutral: "bg-zinc-500/15",
    info: "bg-sky-500/15",
    accent: "bg-violet-500/15",
    success: "bg-emerald-500/15",
    warning: "bg-amber-500/15",
    danger: "bg-rose-500/20",
  };
  return (
    <span
      aria-hidden
      className={[
        "absolute inset-y-0 left-0 transition-[width] duration-200 ease-out motion-reduce:transition-none",
        map[variant],
      ].join(" ")}
      style={{ width: `${Math.max(2, widthPct)}%` }}
    />
  );
}

function BarIcon() {
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
