import { Icon } from "@speakeasy-api/moonshine";
import type { MutableRefObject, ReactNode } from "react";
import type { Suggestion, Section } from "./useFacetSearch";
import {
  relativeTime,
  VARIANT_STYLES,
  type FacetConfig,
  type MatchedSuggestion,
} from "./types";

interface FacetSuggestionsProps<T> {
  sections: Section[];
  activeIndex: number | null;
  listRef: MutableRefObject<Array<HTMLElement | null>>;
  getItemProps: (
    userProps?: React.HTMLProps<HTMLElement>,
  ) => Record<string, unknown>;
  onSelect: (item: Suggestion) => void;
  onActiveIndexChange: (i: number) => void;
  onRemoveSaved?: (viewId: string) => void;
  facetByKey: Map<string, FacetConfig<T>>;
  emptyHint?: ReactNode;
  totalRows: number;
  filteredCount: number;
  listboxId: string;
}

export function FacetSuggestions<T>({
  sections,
  activeIndex,
  listRef,
  getItemProps,
  onSelect,
  onActiveIndexChange,
  onRemoveSaved,
  facetByKey,
  emptyHint,
  totalRows,
  filteredCount,
  listboxId,
}: FacetSuggestionsProps<T>) {
  let flatIndex = 0;
  const isEmpty = sections.every((s) => s.items.length === 0);

  return (
    <div
      role="listbox"
      id={listboxId}
      className="w-full overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/60 ring-1 ring-white/5"
    >
      {isEmpty ? (
        <div className="px-4 py-6 text-center text-sm text-zinc-500">
          {emptyHint ?? "No matches"}
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto py-1.5">
          {sections.map((section) => {
            if (section.items.length === 0) return null;
            return (
              <div key={section.id} className="py-1">
                <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {section.heading}
                </div>
                <ul className="flex flex-col">
                  {section.items.map((item) => {
                    const idx = flatIndex++;
                    const isActive = idx === activeIndex;
                    const optionId = `${listboxId}-opt-${idx}`;
                    return (
                      <li
                        key={item.id}
                        id={optionId}
                        role="option"
                        aria-selected={isActive}
                        ref={(node) => {
                          listRef.current[idx] = node;
                        }}
                        {...getItemProps({
                          onClick: (e) => {
                            e.preventDefault();
                            onSelect(item);
                          },
                          onMouseEnter: () => onActiveIndexChange(idx),
                          onMouseDown: (e) => e.preventDefault(),
                        })}
                        className={[
                          "group flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm outline-none transition-colors",
                          isActive
                            ? "bg-white/5 text-zinc-50"
                            : "text-zinc-300 hover:bg-white/[0.03]",
                        ].join(" ")}
                      >
                        <SuggestionRow
                          item={item}
                          facetByKey={facetByKey}
                          onRemoveSaved={onRemoveSaved}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-950/80 px-3 py-1.5 text-[11px] text-zinc-500">
        <div className="flex items-center gap-3">
          <KeyHint>↑↓</KeyHint>
          <span>navigate</span>
          <KeyHint>↵</KeyHint>
          <span>select</span>
          <KeyHint>esc</KeyHint>
          <span>close</span>
        </div>
        <div className="font-mono text-[10px] text-zinc-500">
          {filteredCount.toLocaleString()} / {totalRows.toLocaleString()} rows
        </div>
      </div>

      {!isEmpty && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800/40 bg-zinc-950/70 px-3 py-1.5 text-[10.5px] text-zinc-500">
          <SyntaxHint label="Wildcard" example="status:5*" />
          <SyntaxHint label="Union" example="status:200 status:404" />
          <SyntaxHint label="Combine" example="method:GET status:200" />
        </div>
      )}
    </div>
  );
}

function SyntaxHint({ label, example }: { label: string; example: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="uppercase tracking-wider text-zinc-600">{label}</span>
      <span className="font-mono text-zinc-400">{example}</span>
    </span>
  );
}

function SuggestionRow<T>({
  item,
  facetByKey,
  onRemoveSaved,
}: {
  item: Suggestion;
  facetByKey: Map<string, FacetConfig<T>>;
  onRemoveSaved?: (viewId: string) => void;
}) {
  if (item.kind === "facet") {
    return (
      <>
        <Icon name="search" size="small" />
        <span className="flex-1 truncate font-mono text-zinc-200">
          <Highlighted text={`${item.facetKey}:`} match={item.match} />
        </span>
        {item.description && (
          <span className="ml-2 truncate text-xs text-zinc-500">
            {item.description}
          </span>
        )}
      </>
    );
  }

  if (item.kind === "value") {
    const facet = facetByKey.get(item.facetKey);
    const variant = facet?.chipVariant?.(item.value) ?? "neutral";
    const display = facet?.formatOptionValue?.(item.value) ?? item.value;
    return (
      <>
        <span
          aria-hidden
          className={["h-1.5 w-1.5 rounded-full", VARIANT_STYLES[variant].dot].join(" ")}
        />
        <span className="flex-1 truncate font-mono text-zinc-200">
          <Highlighted text={String(display)} match={item.match} />
        </span>
        <span className="ml-2 font-mono text-[11px] text-zinc-500">
          {item.count.toLocaleString()}
        </span>
      </>
    );
  }

  if (item.kind === "saved") {
    return (
      <>
        <span aria-hidden className="text-amber-300">
          <Icon name="star" size="small" />
        </span>
        <span className="flex-shrink-0 truncate text-zinc-100">{item.name}</span>
        <span className="ml-1 flex-1 truncate font-mono text-[11px] text-zinc-500">
          {item.label}
        </span>
        {onRemoveSaved && (
          <button
            type="button"
            aria-label={`Remove saved view ${item.name}`}
            className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded text-zinc-500 opacity-0 hover:bg-white/10 hover:text-zinc-200 group-hover:opacity-100 transition-opacity"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveSaved(item.viewId);
            }}
          >
            <Icon name="x" size="small" />
          </button>
        )}
      </>
    );
  }

  if (item.kind === "pattern") {
    const noMatches = item.matchCount === 0;
    return (
      <>
        <span aria-hidden className="text-sky-400">
          <Icon name="asterisk" size="small" />
        </span>
        <span className="flex-1 truncate font-mono text-zinc-100">
          <span className="text-zinc-500">Use pattern: </span>
          <span className="italic">{item.facetKey}:{item.pattern}</span>
        </span>
        <span
          className={[
            "ml-2 font-mono text-[11px]",
            noMatches ? "text-rose-400/80" : "text-sky-300/80",
          ].join(" ")}
        >
          {noMatches
            ? "no matches"
            : `${item.matchCount} value${item.matchCount === 1 ? "" : "s"} · ${item.rowCount} row${item.rowCount === 1 ? "" : "s"}`}
        </span>
      </>
    );
  }

  return (
    <>
      <Icon name="clock" size="small" />
      <span className="flex-1 truncate font-mono text-zinc-300">{item.label}</span>
      <span className="ml-2 shrink-0 text-[11px] text-zinc-500">
        {relativeTime(item.savedAt)}
      </span>
    </>
  );
}

function Highlighted({
  text,
  match,
}: {
  text: string;
  match?: MatchedSuggestion;
}) {
  if (!match || match.ranges.length === 0) return <>{text}</>;
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of match.ranges) {
    if (start > cursor) out.push(<span key={`p${cursor}`}>{text.slice(cursor, start)}</span>);
    out.push(
      <span key={`h${start}`} className="bg-sky-400/20 text-sky-200 rounded-sm">
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  }
  if (cursor < text.length) out.push(<span key={`t${cursor}`}>{text.slice(cursor)}</span>);
  return <>{out}</>;
}

function KeyHint({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-700/60 bg-zinc-800/60 px-1 py-0 font-mono text-[10px] leading-4 text-zinc-300">
      {children}
    </kbd>
  );
}
