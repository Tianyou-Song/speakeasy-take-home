import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { Icon } from "@speakeasy-api/moonshine";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AggregationChip } from "./AggregationChip";
import { AskButton } from "./AskButton";
import { FacetChip } from "./FacetChip";
import { FacetSuggestions } from "./FacetSuggestions";
import { NLLoadingProgress } from "./NLLoadingProgress";
import { NLPill } from "./NLPill";
import { SaveViewButton } from "./SaveViewButton";
import { TopByPanel } from "./TopByPanel";
import { useFacetSearch } from "./useFacetSearch";
import { useSavedViews } from "./useSavedViews";
import { useNLSearch } from "./nl/useNLSearch";
import { resolveChipDisplay, type FacetConfig } from "./types";

interface FacetSearchProps<T> {
  rows: T[];
  facets: FacetConfig<T>[];
  onFilteredChange?: (filtered: T[]) => void;
  placeholder?: string;
  storageKey?: string;
  savedViewsStorageKey?: string;
  className?: string;
}

const DEFAULT_PLACEHOLDER =
  "Filter your logs. Press `Space` to search using natural language queries.";
const ARMED_PLACEHOLDER = "Describe what you're looking for…";
const FALLBACK_PLACEHOLDER =
  "Filter logs… (try `method:`, `status:`, `domain:`, `path:`)";

export function FacetSearch<T>({
  rows,
  facets,
  onFilteredChange,
  placeholder,
  storageKey,
  savedViewsStorageKey,
  className,
}: FacetSearchProps<T>) {
  const savedKey =
    savedViewsStorageKey ??
    (storageKey ? `${storageKey}:saved` : "facet-search:saved:v1");
  const { savedViews, saveView, renameView, removeView } = useSavedViews(savedKey);

  const {
    tokens,
    inputValue,
    setInputValue,
    draft,
    filteredRows,
    sections,
    itemCount,
    facetByKey,
    commitAt,
    commit,
    removeToken,
    removeTokensByIds,
    applyNLResult,
    aggregation,
    setAggregation,
    topN,
    editLastToken,
    editToken,
    clearAll,
    saveCurrentAsRecent,
    matchedSavedView,
  } = useFacetSearch({ rows, facets, storageKey, savedViews });

  // Stable getter so the NL hook can read the latest aggregation without
  // re-subscribing. Used to remember the prior aggregation for Undo.
  const aggregationRef = useRef(aggregation);
  aggregationRef.current = aggregation;
  const getCurrentAggregation = useCallback(() => aggregationRef.current, []);

  const { nlState, available: nlAvailable, arm, disarm, submit, dismissApplied } =
    useNLSearch<T>({
      facets,
      getCurrentAggregation,
      onApply: (newTokens, newAggregation, originalQuery) => {
        applyNLResult({
          tokens: newTokens,
          aggregation: newAggregation,
          nlText: originalQuery,
        });
      },
    });

  const inNLMode =
    nlState.status === "armed" ||
    nlState.status === "loading" ||
    nlState.status === "parsing";

  // Defensive: if a parent feeds the filtered output back in as `rows`, the
  // memo would produce a new identity each render even when contents match.
  const onFilteredChangeRef = useRef(onFilteredChange);
  onFilteredChangeRef.current = onFilteredChange;
  const lastSentRef = useRef<T[] | null>(null);
  useEffect(() => {
    const prev = lastSentRef.current;
    if (
      prev &&
      prev.length === filteredRows.length &&
      prev.every((r, i) => r === filteredRows[i])
    ) {
      return;
    }
    lastSentRef.current = filteredRows;
    onFilteredChangeRef.current?.(filteredRows);
  }, [filteredRows]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const valueModeFacet = draft.mode === "value" ? draft.facetKey : null;
  useEffect(() => {
    setActiveIndex(itemCount > 0 ? 0 : null);
  }, [itemCount, draft.mode, valueModeFacet]);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
          });
        },
        padding: 8,
      }),
    ],
  });

  const role = useRole(context, { role: "listbox" });
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: (idx) => {
      if (idx !== null) setActiveIndex(idx);
    },
    virtual: true,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [role, dismiss, listNav],
  );

  // The dropdown closing with non-empty tokens is our "search submitted" signal.
  useEffect(() => {
    if (!open && tokens.length > 0) saveCurrentAsRecent();
  }, [open, tokens.length, saveCurrentAsRecent]);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isFreeTextDraft =
    draft.mode === "idle" &&
    draft.text.trim().length > 0 &&
    !draft.text.includes(":");

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 1) Space on empty input → arm NL mode (only when available).
    if (
      e.key === " " &&
      inputValue === "" &&
      nlState.status !== "unavailable" &&
      nlState.status !== "checking" &&
      !inNLMode
    ) {
      e.preventDefault();
      arm();
      setOpen(true);
      return;
    }

    // 2) Esc when armed → disarm and clear draft.
    if (e.key === "Escape" && inNLMode) {
      e.preventDefault();
      disarm();
      setInputValue("");
      return;
    }

    // 3) Backspace when armed and input is empty → disarm.
    if (e.key === "Backspace" && inNLMode && inputValue === "") {
      e.preventDefault();
      disarm();
      return;
    }

    // 4) Enter — depends on context.
    if (e.key === "Enter") {
      // 4a) NL submit when armed and we have something to send.
      if (inNLMode && inputValue.trim().length > 0) {
        e.preventDefault();
        const q = inputValue;
        setInputValue("");
        setOpen(false);
        void submit(q);
        return;
      }
      // 4b) Existing suggestion-commit path (preserved when a suggestion is highlighted).
      if (open && activeIndex !== null && itemCount > 0) {
        e.preventDefault();
        commitAt(activeIndex);
        setOpen(true);
        return;
      }
      // 4c) Lenient fallback: free text + Enter → submit as NL.
      if (isFreeTextDraft && nlAvailable) {
        e.preventDefault();
        const q = inputValue;
        setInputValue("");
        setOpen(false);
        arm();
        void submit(q);
        return;
      }
      return;
    }

    // 5) Tab — preserve existing behaviour for suggestions.
    if (e.key === "Tab" && open && activeIndex !== null && itemCount > 0) {
      if (!inNLMode) {
        e.preventDefault();
        commitAt(activeIndex);
        setOpen(true);
      }
      return;
    }

    // 6) Backspace at empty input pops last token (existing behaviour).
    if (
      e.key === "Backspace" &&
      inputValue === "" &&
      tokens.length > 0 &&
      !inNLMode
    ) {
      e.preventDefault();
      editLastToken();
      setOpen(true);
      return;
    }

    if (e.key === "Escape" && !open) {
      inputRef.current?.blur();
    }
  };

  const handleShellMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      e.preventDefault();
      focusInput();
    }
  };

  const handleInputFocus = () => setOpen(true);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setOpen(true);
  };

  const handleAskClick = () => {
    if (!nlAvailable) return;
    if (inputValue.trim().length > 0) {
      // User has typed something — submit it directly.
      const q = inputValue;
      setInputValue("");
      setOpen(false);
      arm();
      void submit(q);
    } else {
      // Empty input — just arm NL mode.
      arm();
      focusInput();
      setOpen(true);
    }
  };

  const activeOptionId =
    activeIndex !== null ? `${listboxId}-opt-${activeIndex}` : undefined;

  const placeholderForState = useMemo(() => {
    if (nlState.status === "unavailable") return placeholder ?? FALLBACK_PLACEHOLDER;
    if (inNLMode) return ARMED_PLACEHOLDER;
    if (tokens.length > 0) return "Add another filter…";
    return placeholder ?? DEFAULT_PLACEHOLDER;
  }, [nlState.status, inNLMode, tokens.length, placeholder]);

  const askButtonState: "idle" | "armed" | "loading" | "parsing" | "unavailable" =
    nlState.status === "unavailable"
      ? "unavailable"
      : nlState.status === "armed"
        ? "armed"
        : nlState.status === "loading"
          ? "loading"
          : nlState.status === "parsing"
            ? "parsing"
            : "idle";

  // Warm-cache flash suppression: if "loading" resolves to "ready" in <500ms
  // (typical for OPFS/Cache hits), never render the bar at all. Avoids a
  // jarring flash on every repeat visit.
  const [loadingBarReady, setLoadingBarReady] = useState(false);
  useEffect(() => {
    if (nlState.status !== "loading") {
      setLoadingBarReady(false);
      return;
    }
    const t = window.setTimeout(() => setLoadingBarReady(true), 500);
    return () => window.clearTimeout(t);
  }, [nlState.status]);

  const showLoadingBar = nlState.status === "loading" && loadingBarReady;

  return (
    <div className={["w-full", className].filter(Boolean).join(" ")}>
      <div
        ref={refs.setReference}
        {...getReferenceProps({ onMouseDown: handleShellMouseDown })}
        className={[
          "group relative flex w-full items-center gap-2 rounded-xl border px-3 py-2",
          "transition-all duration-150 backdrop-blur-sm",
          inNLMode
            ? "border-violet-500/50 bg-zinc-950/80 ring-2 ring-violet-500/30"
            : open
              ? "ring-2 ring-sky-500/30 border-sky-500/40 bg-zinc-950/80 border-zinc-800/80"
              : "border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700/80 ring-0",
        ].join(" ")}
        data-testid="facet-search-shell"
        data-nl-mode={inNLMode ? nlState.status : undefined}
      >
        <span
          className={[
            "flex-shrink-0",
            inNLMode ? "text-violet-300" : "text-zinc-500",
          ].join(" ")}
          aria-hidden
        >
          {inNLMode ? <SparkleIcon /> : <Icon name="search" size="small" />}
        </span>

        <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
          {aggregation && (
            <AggregationChip
              aggregation={aggregation}
              facet={facetByKey.get(aggregation.groupBy)}
              onRemove={() => {
                setAggregation(null);
                focusInput();
              }}
            />
          )}
          {tokens.map((token, i) => {
            const { variant, display, label } = resolveChipDisplay(
              facetByKey.get(token.facetKey),
              token.value,
            );
            const prev = tokens[i - 1];
            const showOr = prev && prev.facetKey === token.facetKey;
            return (
              <span
                key={token.id}
                className="inline-flex items-center gap-1.5"
              >
                {showOr && (
                  <span
                    aria-hidden
                    className="select-none text-[10px] font-mono uppercase tracking-wider text-zinc-500"
                  >
                    or
                  </span>
                )}
                <FacetChip
                  facetKey={token.facetKey}
                  facetLabel={label || token.facetKey}
                  value={token.value}
                  display={display}
                  variant={variant}
                  isPattern={token.isPattern}
                  onEdit={() => editToken(token.id)}
                  onRemove={() => removeToken(token.id)}
                />
              </span>
            );
          })}

          {showLoadingBar ? (
            <NLLoadingProgress
              progress={nlState.loadProgress?.progress ?? 0}
              etaSec={nlState.loadProgress?.etaSec}
              detail={nlState.loadProgress?.text}
              isFirstLoad={nlState.loadProgress?.isFirstLoad}
              bytesLoaded={nlState.loadProgress?.bytesLoaded}
              bytesTotal={nlState.loadProgress?.bytesTotal}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholderForState}
              className={[
                "min-w-[12ch] flex-1 bg-transparent py-0.5 text-sm outline-none border-none focus:ring-0 font-mono",
                inNLMode
                  ? "text-violet-50 placeholder:text-violet-300/50"
                  : "text-zinc-100 placeholder:text-zinc-500",
              ].join(" ")}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-testid="facet-search-input"
            />
          )}
        </div>

        {nlState.status === "parsing" && (
          <span
            aria-hidden
            className="flex-shrink-0 text-[11px] text-violet-300 inline-flex items-center gap-1"
          >
            <SparkleIcon className="motion-safe:animate-pulse" />
            <span className="font-mono">thinking…</span>
          </span>
        )}

        {(tokens.length > 0 || aggregation !== null) && !inNLMode && (
          <SaveViewButton
            tokens={tokens}
            aggregation={aggregation}
            nlText={nlState.lastQuery || undefined}
            matched={matchedSavedView}
            onSave={(name) =>
              saveView(name, tokens, aggregation, nlState.lastQuery || undefined)
            }
            onRename={renameView}
            onDelete={removeView}
            onAfterAction={focusInput}
          />
        )}

        {(tokens.length > 0 || inputValue.length > 0 || aggregation) &&
          !inNLMode && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                clearAll();
                focusInput();
              }}
              className="flex-shrink-0 rounded-md px-2 py-0.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-zinc-200 transition-colors"
              aria-label="Clear all filters"
              tabIndex={-1}
              data-testid="facet-search-clear"
            >
              Clear
            </button>
          )}

        <AskButton
          onClick={handleAskClick}
          state={askButtonState}
          disabledReason="Natural language search isn't available in this browser. Use facet syntax — try `method:`, `status:`, `domain:`, or `path:` instead."
        />

        {!inNLMode && (
          <div className="flex-shrink-0 hidden sm:block" aria-hidden>
            <kbd className="rounded border border-zinc-700/60 bg-zinc-800/40 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              ⌘K
            </kbd>
          </div>
        )}
      </div>

      {nlState.status === "applied" && (
        <NLPill
          query={nlState.lastQuery}
          onUndo={() => {
            removeTokensByIds(nlState.lastAppliedTokenIds);
            setAggregation(nlState.prevAggregation);
            setInputValue(nlState.lastQuery);
            dismissApplied();
            disarm();
            focusInput();
          }}
          onEditPrompt={() => {
            removeTokensByIds(nlState.lastAppliedTokenIds);
            setAggregation(nlState.prevAggregation);
            setInputValue(nlState.lastQuery);
            dismissApplied();
            arm();
            focusInput();
          }}
          onDismiss={() => {
            dismissApplied();
          }}
        />
      )}

      {aggregation && topN && (
        <TopByPanel
          aggregation={aggregation}
          facet={facetByKey.get(aggregation.groupBy)}
          rows={topN}
          totalRows={filteredRows.length}
          onPickValue={(facetKey, value) => {
            // Reuses the existing chip-add path so the new chip behaves
            // identically to a manually-picked one.
            commit({
              kind: "value",
              id: `topby:${facetKey}:${value}`,
              facetKey,
              value,
              count: 0,
            });
            focusInput();
          }}
        />
      )}

      {open && !showLoadingBar && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50"
          >
            <FacetSuggestions
              sections={sections}
              activeIndex={activeIndex}
              listRef={listRef}
              getItemProps={getItemProps}
              onSelect={(item) => {
                commit(item);
                setOpen(true);
                focusInput();
              }}
              onActiveIndexChange={setActiveIndex}
              onRemoveSaved={removeView}
              facetByKey={facetByKey}
              totalRows={rows.length}
              filteredCount={filteredRows.length}
              listboxId={listboxId}
              nlMode={
                nlState.status === "armed"
                  ? "armed"
                  : nlState.status === "failed"
                    ? "failed"
                    : nlState.status === "unavailable" && isFreeTextDraft
                      ? "unavailable"
                      : undefined
              }
              onNLExample={(text) => {
                if (nlState.status === "unavailable") return;
                setInputValue("");
                setOpen(false);
                arm();
                void submit(text);
              }}
              emptyHint={
                draft.mode === "idle" && draft.text.trim().length > 0 ? (
                  <span>
                    No facet matches{" "}
                    <span className="font-mono text-zinc-300">
                      "{draft.text.trim()}"
                    </span>
                    . Try{" "}
                    <span className="font-mono text-sky-400">method:</span>,{" "}
                    <span className="font-mono text-sky-400">status:</span>,{" "}
                    <span className="font-mono text-sky-400">domain:</span>, or{" "}
                    <span className="font-mono text-sky-400">path:</span>.
                  </span>
                ) : (
                  "No matching values"
                )
              }
            />
          </div>
        </FloatingPortal>
      )}

      <span role="status" aria-live="polite" className="sr-only absolute">
        {filteredRows.length === rows.length
          ? `Showing all ${rows.length} rows`
          : `${filteredRows.length} of ${rows.length} rows match`}
      </span>
    </div>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={14}
      height={14}
      className={["fill-current", className].filter(Boolean).join(" ")}
    >
      <path d="M12 3l1.9 4.9L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-2.1L12 3z" />
    </svg>
  );
}
