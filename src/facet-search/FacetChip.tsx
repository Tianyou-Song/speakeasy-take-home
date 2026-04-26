import { Icon } from "@speakeasy-api/moonshine";
import type { KeyboardEventHandler, MouseEventHandler, ReactNode, Ref } from "react";
import { VARIANT_STYLES, type ChipVariant, type Op } from "./types";

interface FacetChipProps {
  facetLabel: string;
  facetKey: string;
  value: string;
  display: ReactNode;
  variant: ChipVariant;
  isPattern?: boolean;
  negated?: boolean;
  op?: Op;
  onEdit: () => void;
  onRemove: () => void;
  // Roving-tabIndex props. The chip rail tracks one focused chip via
  // chipFocusIndex; this chip is `tabIndex=0` (the only tab stop in the rail)
  // when isFocused, `tabIndex=-1` otherwise. onKeyDown receives chip-level
  // navigation (arrows / Home / End / Backspace / Delete / Enter / F2 / Esc).
  isFocused?: boolean;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  chipRef?: Ref<HTMLDivElement>;
}

// Display glyph for an operator. Comparators use Unicode ≥/≤ for visual
// punch (the keyboard shortcut for entry stays ASCII >= / <=); ".." renders
// as an en-dash inline between the two range bounds.
function comparatorGlyph(op: Op): string {
  switch (op) {
    case ">":  return ">";
    case ">=": return "≥";
    case "<":  return "<";
    case "<=": return "≤";
    case "..": return "";
  }
}

function formatRangeValue(value: string): string {
  const [lo, hi] = value.split("..");
  if (!lo || !hi) return value;
  return `${lo}–${hi}`;
}

export function FacetChip({
  facetLabel,
  facetKey,
  value,
  display,
  variant,
  isPattern = false,
  negated = false,
  op,
  onEdit,
  onRemove,
  isFocused,
  tabIndex,
  onKeyDown,
  chipRef,
}: FacetChipProps) {
  const styles = VARIANT_STYLES[variant];

  // Negated chips override the underlying variant with a desaturated rose
  // scheme so `-status:500` is visually distinct from `status:500` (which is
  // already rendered in danger/red by the chipVariant rule).
  const chipClass = negated
    ? "bg-zinc-900/70 border-rose-400/40 text-zinc-100 hover:bg-zinc-900"
    : styles.chip;
  const labelClass = negated
    ? "text-rose-300/70 font-mono tracking-tight"
    : `${styles.label} font-mono tracking-tight`;

  const handleRemove: MouseEventHandler = (e) => {
    e.stopPropagation();
    onRemove();
  };

  const handleEdit: MouseEventHandler = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const titleSummary = (() => {
    if (negated && op === "..") return `${facetLabel} not in ${formatRangeValue(value)}`;
    if (negated && op) return `${facetLabel} not ${comparatorGlyph(op)} ${value}`;
    if (negated) return `${facetLabel} is not ${value}`;
    if (op === "..") return `${facetLabel} in ${formatRangeValue(value)}`;
    if (op) return `${facetLabel} ${comparatorGlyph(op)} ${value}`;
    if (isPattern) return `${facetLabel} matches pattern ${value}`;
    return `${facetLabel}: ${value}`;
  })();

  return (
    <div
      ref={chipRef}
      role="button"
      tabIndex={tabIndex ?? -1}
      aria-pressed={isFocused ? true : undefined}
      aria-label={titleSummary}
      className={[
        "group inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
        "text-xs font-medium leading-5 cursor-pointer select-none transition-colors shrink-0",
        "outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950",
        chipClass,
        isPattern && !op ? "border-dashed" : "",
      ].join(" ")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleEdit}
      onKeyDown={onKeyDown}
      title={`${titleSummary} — click to edit, Backspace to remove`}
      data-testid={`chip-${negated ? "neg-" : ""}${facetKey}-${value}`}
      data-facet-chip
    >
      {negated && (
        <span
          aria-hidden="true"
          className="text-rose-300/90 font-mono leading-none -mr-0.5"
        >
          −
        </span>
      )}
      <span className={labelClass}>{facetKey}:</span>
      {op === ".." ? (
        <span className="font-mono tracking-tight">{formatRangeValue(value)}</span>
      ) : op ? (
        <span className="font-mono tracking-tight inline-flex items-center gap-0.5">
          <span className="opacity-80">{comparatorGlyph(op)}</span>
          {display}
        </span>
      ) : (
        <span
          className={[
            "font-mono tracking-tight",
            isPattern ? "italic" : "",
          ].join(" ")}
        >
          {display}
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${titleSummary}`}
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

interface AdvancedChipProps {
  text: string;
  onEdit: () => void;
  onRemove: () => void;
  isFocused?: boolean;
  tabIndex?: number;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  chipRef?: Ref<HTMLDivElement>;
}

// Single chip rendered when the query is in advanced mode (cross-facet OR,
// nested AND/OR, etc — anything the chip rail can't faithfully flatten).
// Visually distinct from facet chips: dotted border, neutral zinc styling,
// monospace fragment of the raw text. Click-to-edit returns the user to a
// blank simple state with the text restored to the input.
export function AdvancedChip({
  text,
  onEdit,
  onRemove,
  isFocused,
  tabIndex,
  onKeyDown,
  chipRef,
}: AdvancedChipProps) {
  const handleRemove: MouseEventHandler = (e) => {
    e.stopPropagation();
    onRemove();
  };
  const handleEdit: MouseEventHandler = (e) => {
    e.stopPropagation();
    onEdit();
  };
  const truncated = text.length > 64 ? `${text.slice(0, 61)}…` : text;
  return (
    <div
      ref={chipRef}
      role="button"
      tabIndex={tabIndex ?? -1}
      aria-pressed={isFocused ? true : undefined}
      aria-label={`Advanced query: ${text}`}
      className={[
        "group inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5",
        "text-xs font-medium leading-5 cursor-pointer select-none transition-colors shrink-0",
        "border-dashed border-zinc-600/60 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-900",
        "outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950",
      ].join(" ")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleEdit}
      onKeyDown={onKeyDown}
      title={`Advanced query: ${text} — click to edit, Backspace to remove`}
      data-testid="chip-advanced"
      data-facet-chip
    >
      <span aria-hidden className="text-amber-300/80">
        <CodeIcon />
      </span>
      <span className="font-mono tracking-tight text-zinc-300/90 text-[10px] uppercase">
        Advanced
      </span>
      <span className="font-mono tracking-tight max-w-[28ch] truncate">
        {truncated}
      </span>
      <button
        type="button"
        aria-label="Remove advanced query"
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

function CodeIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={11} height={11} className="fill-current">
      <path d="M8.7 16.3 4.4 12l4.3-4.3 1.4 1.4L7.2 12l2.9 2.9-1.4 1.4zm6.6 0-1.4-1.4 2.9-2.9-2.9-2.9 1.4-1.4L19.6 12l-4.3 4.3z" />
    </svg>
  );
}
