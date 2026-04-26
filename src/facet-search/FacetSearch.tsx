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
import { FacetChip } from "./FacetChip";
import { FacetSuggestions } from "./FacetSuggestions";
import { useFacetSearch } from "./useFacetSearch";
import { useSavedViews } from "./useSavedViews";
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

export function FacetSearch<T>({
  rows,
  facets,
  onFilteredChange,
  placeholder = "Filter logs… (try `method:`, `status:`, `domain:`)",
  storageKey,
  savedViewsStorageKey,
  className,
}: FacetSearchProps<T>) {
  const savedKey =
    savedViewsStorageKey ??
    (storageKey ? `${storageKey}:saved` : "facet-search:saved:v1");
  const { savedViews, saveView, removeView } = useSavedViews(savedKey);

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
    editLastToken,
    editToken,
    clearAll,
    saveCurrentAsRecent,
  } = useFacetSearch({ rows, facets, storageKey, savedViews });

  // Defensive: if a parent feeds the filtered output back in as `rows`, the
  // memo would produce a new identity each render even when contents match.
  // Compare contents before notifying so we don't trigger an update loop.
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || (e.key === "Tab" && open && activeIndex !== null)) {
      if (activeIndex !== null && itemCount > 0) {
        e.preventDefault();
        commitAt(activeIndex);
        setOpen(true);
      }
      return;
    }
    if (e.key === "Backspace" && inputValue === "" && tokens.length > 0) {
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

  const activeOptionId =
    activeIndex !== null ? `${listboxId}-opt-${activeIndex}` : undefined;

  const placeholderForState = useMemo(
    () => (tokens.length > 0 ? "Add another filter…" : placeholder),
    [tokens.length, placeholder],
  );

  return (
    <div className={["w-full", className].filter(Boolean).join(" ")}>
      <div
        ref={refs.setReference}
        {...getReferenceProps({ onMouseDown: handleShellMouseDown })}
        className={[
          "group relative flex w-full items-center gap-2 rounded-xl border px-3 py-2",
          "transition-all duration-150 border-zinc-800/80 bg-zinc-950/60 backdrop-blur-sm",
          "hover:border-zinc-700/80",
          open
            ? "ring-2 ring-sky-500/30 border-sky-500/40 bg-zinc-950/80"
            : "ring-0",
        ].join(" ")}
        data-testid="facet-search-shell"
      >
        <span className="flex-shrink-0 text-zinc-500" aria-hidden>
          <Icon name="search" size="small" />
        </span>

        <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
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

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleInputKeyDown}
            placeholder={placeholderForState}
            className="min-w-[12ch] flex-1 bg-transparent py-0.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none border-none focus:ring-0 font-mono"
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
        </div>

        {tokens.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const name = window.prompt("Name this view:");
              if (name && name.trim()) {
                saveView(name, tokens);
              }
              focusInput();
            }}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-amber-400/10 hover:text-amber-300 transition-colors"
            aria-label="Save current filters as a view"
            title="Save current filters as a view"
            tabIndex={-1}
            data-testid="facet-search-save-view"
          >
            <Icon name="star" size="small" />
            <span className="hidden sm:inline">Save view</span>
          </button>
        )}

        {(tokens.length > 0 || inputValue.length > 0) && (
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

        <div className="flex-shrink-0 hidden sm:block" aria-hidden>
          <kbd className="rounded border border-zinc-700/60 bg-zinc-800/40 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            ⌘K
          </kbd>
        </div>
      </div>

      {open && (
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
