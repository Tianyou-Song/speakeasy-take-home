import { Icon } from "@speakeasy-api/moonshine";
import type { MouseEventHandler, ReactNode } from "react";
import { VARIANT_STYLES, type ChipVariant } from "./types";

interface FacetChipProps {
  facetLabel: string;
  facetKey: string;
  value: string;
  display: ReactNode;
  variant: ChipVariant;
  isPattern?: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

export function FacetChip({
  facetLabel,
  facetKey,
  value,
  display,
  variant,
  isPattern = false,
  onEdit,
  onRemove,
}: FacetChipProps) {
  const styles = VARIANT_STYLES[variant];

  const handleRemove: MouseEventHandler = (e) => {
    e.stopPropagation();
    onRemove();
  };

  const handleEdit: MouseEventHandler = (e) => {
    e.stopPropagation();
    onEdit();
  };

  return (
    <span
      className={[
        "group inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
        "text-xs font-medium leading-5 cursor-pointer select-none transition-colors shrink-0",
        styles.chip,
        isPattern ? "border-dashed" : "",
      ].join(" ")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleEdit}
      title={
        isPattern
          ? `${facetLabel} matches pattern ${value} — click to edit`
          : `${facetLabel}: ${value} — click to edit`
      }
      data-testid={`chip-${facetKey}-${value}`}
      data-facet-chip
    >
      <span className={[styles.label, "font-mono tracking-tight"].join(" ")}>
        {facetKey}:
      </span>
      <span
        className={[
          "font-mono tracking-tight",
          isPattern ? "italic" : "",
        ].join(" ")}
      >
        {display}
      </span>
      <button
        type="button"
        aria-label={`Remove ${facetLabel} ${value}`}
        className="-mr-0.5 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-white/10 transition-opacity"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleRemove}
        tabIndex={-1}
      >
        <Icon name="x" size="small" />
      </button>
    </span>
  );
}
