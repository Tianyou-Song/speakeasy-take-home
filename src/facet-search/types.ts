import type { ReactNode } from "react";

export type FacetType = "enum" | "string" | "number";

export type ChipVariant =
  | "neutral"
  | "info"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export interface FacetConfig<T> {
  key: string;
  label: string;
  description?: string;
  type: FacetType;
  accessor?: (row: T) => string | number;
  formatChipValue?: (value: string | number) => ReactNode;
  formatOptionValue?: (value: string | number) => ReactNode;
  chipVariant?: (value: string | number) => ChipVariant;
}

export interface Token {
  id: string;
  facetKey: string;
  value: string;
  isPattern?: boolean;
}

export type Draft =
  | { mode: "idle"; text: string }
  | { mode: "value"; facetKey: string; partial: string };

export interface MatchedSuggestion {
  key: string;
  score: number;
  ranges: [number, number][];
}

export const VARIANT_STYLES: Record<
  ChipVariant,
  { chip: string; label: string; dot: string }
> = {
  neutral: {
    chip: "bg-zinc-800/70 border-zinc-700/70 text-zinc-100 hover:bg-zinc-800",
    label: "text-zinc-400",
    dot: "bg-zinc-400",
  },
  info: {
    chip: "bg-sky-500/10 border-sky-400/30 text-sky-200 hover:bg-sky-500/15",
    label: "text-sky-400/80",
    dot: "bg-sky-400",
  },
  accent: {
    chip: "bg-violet-500/10 border-violet-400/30 text-violet-200 hover:bg-violet-500/15",
    label: "text-violet-400/80",
    dot: "bg-violet-400",
  },
  success: {
    chip: "bg-emerald-500/10 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/15",
    label: "text-emerald-400/80",
    dot: "bg-emerald-400",
  },
  warning: {
    chip: "bg-amber-500/10 border-amber-400/30 text-amber-200 hover:bg-amber-500/15",
    label: "text-amber-400/80",
    dot: "bg-amber-400",
  },
  danger: {
    chip: "bg-rose-500/10 border-rose-400/30 text-rose-200 hover:bg-rose-500/15",
    label: "text-rose-400/80",
    dot: "bg-rose-400",
  },
};

export function getFacetValue<T>(row: T, facet: FacetConfig<T>): string | number {
  if (facet.accessor) return facet.accessor(row);
  return (row as Record<string, unknown>)[facet.key] as string | number;
}

export function resolveChipDisplay<T>(
  facet: FacetConfig<T> | undefined,
  value: string,
): { variant: ChipVariant; display: ReactNode; label: string } {
  return {
    variant: facet?.chipVariant?.(value) ?? "neutral",
    display: facet?.formatChipValue?.(value) ?? value,
    label: facet?.label ?? "",
  };
}

export function serialiseTokens(tokens: Token[]): string {
  return tokens.map((t) => `${t.facetKey}:${t.value}`).join(" ");
}

export function isPatternValue(value: string): boolean {
  return value.includes("*");
}

export function isPatternFacet<T>(facet: FacetConfig<T>): boolean {
  // Wildcards add no value on enums (finite known set); restrict to string/number.
  return facet.type !== "enum";
}

export function relativeTime(savedAt: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - savedAt);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(savedAt).toLocaleDateString();
}
