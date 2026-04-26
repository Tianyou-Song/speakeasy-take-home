import { Icon } from "@speakeasy-api/moonshine";
import type { MutableRefObject, ReactNode } from "react";
import type { Suggestion, Section } from "./useFacetSearch";
import { EXAMPLE_NL_QUERIES } from "./nl/examples";
import {
  derivePatternFromValue,
  relativeTime,
  VARIANT_STYLES,
  type FacetConfig,
  type MatchedSuggestion,
} from "./types";

export type NLSuggestionsMode = "armed" | "failed" | "unavailable";

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
  // Click-to-insert from the syntax-hint footer / NL examples puts the
  // example text into the input. The mouse-only path to discovering
  // typed-syntax features that don't have a value-row equivalent.
  onSyntaxHintInsert?: (text: string) => void;
  // NL-mode override: when set, replaces the regular sections with an NL hint /
  // failure / unavailable view. `onNLExample` is required when nlMode is set.
  nlMode?: NLSuggestionsMode;
  onNLExample?: (text: string) => void;
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
  onSyntaxHintInsert,
  nlMode,
  onNLExample,
}: FacetSuggestionsProps<T>) {
  let flatIndex = 0;
  const isEmpty = sections.every((s) => s.items.length === 0);

  // NL-mode panes replace the regular sections entirely.
  if (nlMode) {
    return (
      <div
        role="listbox"
        id={listboxId}
        className="w-full overflow-hidden rounded-xl border border-violet-500/30 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/60 ring-1 ring-violet-500/10"
        data-nl-mode={nlMode}
      >
        <NLPane mode={nlMode} onPick={onNLExample} />
        <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-950/80 px-3 py-1.5 text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <KeyHint>↵</KeyHint>
            <span>ask</span>
            <KeyHint>esc</KeyHint>
            <span>cancel</span>
          </div>
        </div>
      </div>
    );
  }

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
                          onSelect={onSelect}
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800/40 bg-zinc-950/70 px-3 py-1.5 text-[10.5px] text-zinc-500">
          <SyntaxHint label="Wildcard" example="status:5*" onInsert={onSyntaxHintInsert} />
          <SyntaxHint label="Exclude" example="-status:500" onInsert={onSyntaxHintInsert} />
          <SyntaxHint label="Range" example="status:[400 TO 499]" onInsert={onSyntaxHintInsert} />
          <SyntaxHint label="Between" example="status:200..299" onInsert={onSyntaxHintInsert} />
          <SyntaxHint
            label="Union"
            example="domain:(speakeasy.com OR openai.com)"
            onInsert={onSyntaxHintInsert}
          />
          <SyntaxHint
            label="Combine"
            example="method:GET AND status:200"
            onInsert={onSyntaxHintInsert}
          />
          <SyntaxHint label="Negate" example="NOT method:GET" onInsert={onSyntaxHintInsert} />
        </div>
      )}
    </div>
  );
}

// Click-to-insert footer hint. The button is a visible mouse-only path to
// discovering typed-syntax features (Union/Combine/Negate) that have no
// equivalent value-row affordance. When `onInsert` is omitted the hint
// falls back to a non-interactive label.
function SyntaxHint({
  label,
  example,
  onInsert,
}: {
  label: string;
  example: string;
  onInsert?: (text: string) => void;
}) {
  if (!onInsert) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="uppercase tracking-wider text-zinc-600">{label}</span>
        <span className="font-mono text-zinc-400">{example}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onInsert(example)}
      title={`Insert example: ${example}`}
      className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors"
    >
      <span className="uppercase tracking-wider text-zinc-600">{label}</span>
      <span className="font-mono text-zinc-400">{example}</span>
    </button>
  );
}

function SuggestionRow<T>({
  item,
  facetByKey,
  onRemoveSaved,
  onSelect,
}: {
  item: Suggestion;
  facetByKey: Map<string, FacetConfig<T>>;
  onRemoveSaved?: (viewId: string) => void;
  onSelect: (item: Suggestion) => void;
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
        {item.negated ? (
          <span
            aria-hidden
            className="font-mono text-rose-300/90 leading-none w-2 -mr-0.5"
          >
            −
          </span>
        ) : (
          <span
            aria-hidden
            className={["h-1.5 w-1.5 rounded-full", VARIANT_STYLES[variant].dot].join(" ")}
          />
        )}
        <span className="flex-1 truncate font-mono text-zinc-200">
          <Highlighted text={String(display)} match={item.match} />
        </span>
        <span className="ml-2 font-mono text-[11px] text-zinc-500">
          {item.count.toLocaleString()}
        </span>
        <ValueActionButtons item={item} facet={facet} onSelect={onSelect} />
      </>
    );
  }

  if (item.kind === "saved") {
    // NL-derived views: render the prompt italic + non-mono so it reads as prose;
    // filter/agg views keep the mono technical label.
    const isNL = !!item.nlText;
    return (
      <>
        <span aria-hidden className={isNL ? "text-violet-300" : "text-amber-300"}>
          <Icon name="star" size="small" />
        </span>
        <span className="flex-shrink-0 truncate text-zinc-100">{item.name}</span>
        <span
          className={[
            "ml-1 flex-1 truncate text-[11px] text-zinc-500",
            isNL ? "italic" : "font-mono",
          ].join(" ")}
        >
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
        <span aria-hidden className={item.negated ? "text-rose-300/90" : "text-sky-400"}>
          {item.negated ? (
            <span className="font-mono leading-none">−</span>
          ) : (
            <Icon name="asterisk" size="small" />
          )}
        </span>
        <span className="flex-1 truncate font-mono text-zinc-100">
          <span className="text-zinc-500">{item.negated ? "Exclude pattern: " : "Use pattern: "}</span>
          <span className="italic">
            {item.negated ? "-" : ""}{item.facetKey}:{item.pattern}
          </span>
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
        <ValueActionButtons item={item} facet={facetByKey.get(item.facetKey)} onSelect={onSelect} />
      </>
    );
  }

  if (item.kind === "range") {
    const opGlyph =
      item.op === ">="
        ? "≥"
        : item.op === "<="
          ? "≤"
          : item.op === ".."
            ? ""
            : item.op;
    const valueDisplay =
      item.op === ".." ? item.value.replace("..", "–") : `${opGlyph}${item.value}`;
    const noMatches = item.matchCount === 0;
    return (
      <>
        <span aria-hidden className={item.negated ? "text-rose-300/90" : "text-sky-400"}>
          {item.negated ? (
            <span className="font-mono leading-none">−</span>
          ) : (
            <span className="font-mono text-[11px]">≷</span>
          )}
        </span>
        <span className="flex-1 truncate font-mono text-zinc-100">
          <span className="text-zinc-500">
            {item.negated ? "Exclude range: " : "Apply range: "}
          </span>
          <span>
            {item.facetKey}:{valueDisplay}
          </span>
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
        <ValueActionButtons item={item} facet={facetByKey.get(item.facetKey)} onSelect={onSelect} />
      </>
    );
  }

  if (item.kind === "invalid") {
    return (
      <>
        <span aria-hidden className="text-rose-400/80">
          <Icon name="info" size="small" />
        </span>
        <span className="flex-1 truncate text-rose-200/90">{item.message}</span>
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

// Always-visible action buttons for a value/pattern/range suggestion:
//   * `+` — commit as positive (the row body's default if not negated)
//   * `−` — commit as negated
//   * `~` — convert this value into a pattern chip, the mouse-only path to
//     wildcards. Numeric facets get the HTTP-class `<first-digit>*` form
//     (`500` → `5*`); string facets get `*value*` (contains). Hidden on
//     enums (where wildcards are redundant) and on rows that already
//     represent a pattern/range.
//
// Pattern research: Kibana Discover hides these behind hover — clean but fails
// discoverability for users who don't think to mouse over each row. Linear,
// Notion, and Airtable keep the equivalent operator controls always visible,
// which trades a small amount of visual weight for a feature that's actually
// findable. For a dropdown with ≤10 rows per facet, always-visible is right;
// hover-only would only matter at table-cell density. The buttons are styled
// muted at rest (low-saturation border + dimmed glyph) and brighten on hover
// or row hover so they read as auxiliary affordances, not callouts. The button
// matching the current draft polarity is ring-highlighted so the user can see
// at a glance which one matches "Enter" / row-body click.
function ValueActionButtons<T>({
  item,
  facet,
  onSelect,
}: {
  item: Suggestion & { negated: boolean };
  facet: FacetConfig<T> | undefined;
  onSelect: (item: Suggestion) => void;
}) {
  // ~ button only on plain value rows AND non-enum facets — pattern/range
  // rows already encode a wildcard/range so the mouse path adds nothing.
  const showPattern =
    item.kind === "value" && facet !== undefined && facet.type !== "enum";
  const value = item.kind === "value" ? item.value : "";
  const pattern =
    showPattern && facet ? derivePatternFromValue(value, facet.type) : "";

  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      <PolarityButton
        kind="include"
        active={!item.negated}
        onClick={() => onSelect({ ...item, negated: false } as Suggestion)}
      />
      <PolarityButton
        kind="exclude"
        active={!!item.negated}
        onClick={() => onSelect({ ...item, negated: true } as Suggestion)}
      />
      {showPattern && (
        <PatternButton
          pattern={pattern}
          onClick={() =>
            onSelect({
              kind: "pattern",
              id: `pattern:${item.facetKey}:${pattern}`,
              facetKey: item.facetKey,
              pattern,
              // matchCount/rowCount aren't displayed post-commit; the chip
              // shows the pattern and the table reflects the actual filter.
              matchCount: 0,
              rowCount: 0,
              negated: false,
            })
          }
        />
      )}
    </span>
  );
}

// Mouse-only pattern button (`~`). Tooltip shows the resulting pattern
// before click so the user knows what they'll get without committing.
function PatternButton({
  pattern,
  onClick,
}: {
  pattern: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Match pattern ${pattern}`}
      title={`Match pattern: ${pattern}`}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "inline-flex h-5 w-5 items-center justify-center rounded border font-mono text-sm leading-none transition-colors",
        "border-sky-500/25 text-sky-300/60",
        "group-hover:border-sky-400/50 group-hover:text-sky-300/90",
        "hover:!border-sky-400/70 hover:!bg-sky-500/15 hover:!text-sky-100",
        // Italic to echo the pattern-chip styling on the rail.
        "italic",
      ].join(" ")}
      data-testid={`row-pattern-${pattern}`}
    >
      ~
    </button>
  );
}

function PolarityButton({
  kind,
  active,
  onClick,
}: {
  kind: "include" | "exclude";
  active: boolean;
  onClick: () => void;
}) {
  const isInclude = kind === "include";
  return (
    <button
      type="button"
      aria-label={isInclude ? "Filter for this value" : "Filter out this value"}
      aria-pressed={active}
      title={isInclude ? "Include" : "Exclude"}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "inline-flex h-5 w-5 items-center justify-center rounded border font-mono text-sm leading-none transition-colors",
        // Rest state: visible but muted so the value text stays primary.
        isInclude
          ? "border-sky-500/25 text-sky-300/60 group-hover:border-sky-400/50 group-hover:text-sky-300/90 hover:!border-sky-400/70 hover:!bg-sky-500/15 hover:!text-sky-100"
          : "border-rose-500/25 text-rose-300/60 group-hover:border-rose-400/50 group-hover:text-rose-300/90 hover:!border-rose-400/70 hover:!bg-rose-500/15 hover:!text-rose-100",
        // Active polarity (the one that matches the typed draft / row default).
        active && isInclude
          ? "bg-sky-500/15 text-sky-200 border-sky-400/60 ring-1 ring-inset ring-sky-400/40"
          : "",
        active && !isInclude
          ? "bg-rose-500/15 text-rose-200 border-rose-400/60 ring-1 ring-inset ring-rose-400/40"
          : "",
      ].join(" ")}
    >
      {isInclude ? "+" : "−"}
    </button>
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

function NLPane({
  mode,
  onPick,
}: {
  mode: NLSuggestionsMode;
  onPick?: (text: string) => void;
}) {
  if (mode === "unavailable") {
    return (
      <div
        className="px-4 py-4 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-2 text-zinc-300">
          <span aria-hidden className="mt-0.5 text-zinc-500">
            <Icon name="info" size="small" />
          </span>
          <div>
            <p className="text-zinc-200">
              Natural language search isn't supported in this browser.
            </p>
            <p className="mt-1 text-zinc-500">
              Try{" "}
              <span className="font-mono text-zinc-300">5xx</span>,{" "}
              <span className="font-mono text-zinc-300">GET</span>, or any{" "}
              <span className="font-mono text-zinc-300">facet:value</span> pair.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const heading =
    mode === "armed"
      ? "Try natural language"
      : "Couldn't parse — try one of these";
  const sub =
    mode === "armed"
      ? "Type a question, or pick an example to run it."
      : "We couldn't extract any filters from that query.";

  return (
    <div className="py-2">
      <div className="px-3 pb-1.5 pt-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          <SparkleSm />
          <span>{heading}</span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>
      </div>
      <ul className="flex flex-col">
        {EXAMPLE_NL_QUERIES.map((text) => (
          <li key={text}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick?.(text)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-violet-500/10 hover:text-violet-100 transition-colors"
            >
              <span aria-hidden className="text-violet-300/70">
                <SparkleSm />
              </span>
              <span className="font-mono text-zinc-200 group-hover:text-violet-100">
                {text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SparkleSm() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={11} height={11} className="fill-current">
      <path d="M12 3l1.9 4.9L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-2.1L12 3z" />
    </svg>
  );
}
