import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { Icon } from "@speakeasy-api/moonshine";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SavedView } from "./useSavedViews";
import type { Aggregation, Token } from "./types";

interface SaveViewButtonProps {
  tokens: Token[];
  aggregation: Aggregation | null;
  nlText?: string;
  matched: SavedView | null;
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAfterAction?: () => void;
}

export function SaveViewButton({
  tokens,
  aggregation,
  nlText,
  matched,
  onSave,
  onRename,
  onDelete,
  onAfterAction,
}: SaveViewButtonProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const isSaved = matched !== null;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    placement: "bottom-end",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });

  const role = useRole(context, { role: "dialog" });
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const { getReferenceProps, getFloatingProps } = useInteractions([role, dismiss]);

  const close = useCallback(() => {
    setOpen(false);
    onAfterAction?.();
  }, [onAfterAction]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        {...getReferenceProps({
          onClick: () => setOpen((v) => !v),
        })}
        className={[
          "flex-shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors",
          isSaved
            ? "text-amber-300 hover:bg-amber-400/15"
            : "text-zinc-500 hover:bg-amber-400/10 hover:text-amber-300",
        ].join(" ")}
        aria-pressed={isSaved}
        aria-label={
          isSaved
            ? `Manage saved view "${matched.name}"`
            : "Save current filters as a view"
        }
        title={
          isSaved
            ? `Saved as "${matched.name}"`
            : "Save current filters as a view"
        }
        tabIndex={-1}
        data-testid="facet-search-save-view"
        data-saved={isSaved ? "true" : "false"}
      >
        <StarIcon filled={isSaved} />
        <span className="hidden sm:inline">
          {isSaved ? matched.name : "Save view"}
        </span>
      </button>

      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} initialFocus={0}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-50 w-72 overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/60 ring-1 ring-white/5"
              aria-labelledby={labelId}
              data-testid="save-view-popover"
            >
              {isSaved ? (
                <ManagePane
                  labelId={labelId}
                  view={matched}
                  onRename={(name) => {
                    onRename(matched.id, name);
                    close();
                  }}
                  onDelete={() => {
                    onDelete(matched.id);
                    close();
                  }}
                  onCancel={close}
                />
              ) : (
                <SavePane
                  labelId={labelId}
                  defaultName={defaultName(tokens, aggregation, nlText)}
                  onSave={(name) => {
                    onSave(name);
                    close();
                  }}
                  onCancel={close}
                />
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

function SavePane({
  labelId,
  defaultName,
  onSave,
  onCancel,
}: {
  labelId: string;
  defaultName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave(trimmed);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 px-3 py-3"
    >
      <div
        id={labelId}
        className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
      >
        Save view
      </div>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this view"
        className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20"
        spellCheck={false}
        autoComplete="off"
        data-testid="save-view-name-input"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          onMouseDown={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="save-view-confirm"
        >
          <StarIcon filled />
          Save
        </button>
      </div>
    </form>
  );
}

function ManagePane({
  labelId,
  view,
  onRename,
  onDelete,
  onCancel,
}: {
  labelId: string;
  view: SavedView;
  onRename: (name: string) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(view.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== view.name;

  const submit = () => {
    if (!dirty) {
      onCancel();
      return;
    }
    onRename(trimmed);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 px-3 py-3"
    >
      <div
        id={labelId}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
      >
        <StarIcon filled />
        <span>Saved view</span>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20"
        spellCheck={false}
        autoComplete="off"
        aria-label="View name"
        data-testid="manage-view-name-input"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
          data-testid="manage-view-delete"
        >
          <Icon name="trash-2" size="small" />
          Delete
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={!dirty}
            onMouseDown={(e) => e.preventDefault()}
            className="rounded-md bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="manage-view-rename"
          >
            Rename
          </button>
        </div>
      </div>
    </form>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={12}
      height={12}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// Default-name suggestion. Priority:
//   1. NL prompt — for AI searches the prompt IS the human label
//   2. First token + count — for plain filter views
//   3. "Top N by X" — for aggregation-only views
function defaultName(
  tokens: Token[],
  aggregation: Aggregation | null,
  nlText?: string,
): string {
  if (nlText && nlText.trim().length > 0) {
    const trimmed = nlText.trim();
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  }
  if (tokens.length > 0) {
    const first = tokens[0];
    return tokens.length === 1
      ? `${first.facetKey}:${first.value}`
      : `${first.facetKey}:${first.value} +${tokens.length - 1}`;
  }
  if (aggregation) {
    const dir = aggregation.orderBy === "count_asc" ? "Bottom" : "Top";
    return `${dir} ${aggregation.limit} by ${aggregation.groupBy}`;
  }
  return "";
}
