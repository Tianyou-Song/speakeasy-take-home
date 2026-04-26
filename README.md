# Speakeasy Frontend Focus — Facet Search

A DataDog-style log filter — type a facet name, hit `:`, pick a value, repeat. Tokens
become coloured chips, the table below filters live.

## Run

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints. Click the input (or press `Cmd/Ctrl+K` from anywhere).

## Usage

| Action | Keyboard | Mouse |
|---|---|---|
| Open suggestions | Click / focus the input, or `Cmd/Ctrl+K` | Click the input |
| Pick a facet (`method`, `status`, `domain`, `path`) | type / arrow + `Enter` or `Tab` | click the row |
| Pick a value | type / arrow + `Enter` or `Tab` | click the row |
| Wildcard match | type `status:5*`, `path:*/auth/*` | — |
| Save current filters as a view | — | click ★ in the input shell |
| Apply a saved view / recent | type / arrow + `Enter` | click the row |
| Edit the last chip | `Backspace` on empty input | click the chip body |
| Remove a specific chip | — | click `×` on the chip |
| Clear everything | click `Clear` | click `Clear` |
| Close suggestions | `Esc` | click outside |

Filtering semantics match DataDog / Sentry: **AND** across different facets, **OR** within
the same facet. Adjacent same-facet chips render with a small `OR` connector to make the
semantics visible. Wildcards (`*`) compile to anchored, case-insensitive regex and are
restricted to non-enum facets.

Recently-committed queries and named *Saved Views* persist to `localStorage` under
separate keys; both surface in the dropdown when the input is empty. Recents show
relative timestamps (`just now`, `5m ago`, `2d ago`).

## Architecture

```
src/
  FuzzySearch.tsx              thin wrapper: declares the HttpLog facet config
  facet-search/
    FacetSearch.tsx            input shell + chip rail + Floating-UI dropdown
    FacetSuggestions.tsx       sectioned dropdown (Facets / Values / Saved / Recent)
    FacetChip.tsx              colour-coded chip (italic + dashed for patterns)
    useFacetSearch.ts          state hook (tokens, draft, derived sections, recents)
    useSavedViews.ts           saved-views hook (localStorage, separate key)
    parse.ts                   parseDraft(input) → { mode, facetKey?, partial }
    filter.ts                  filterRows + uniqueValuesForFacet + matchToken (wildcard)
    match.ts                   subsequence fuzzy matcher with highlight ranges
    types.ts                   Token, FacetConfig, relativeTime, isPatternValue/Facet
    index.ts
```

The component is **generic**. Wiring it to a different schema is a one-file change:

```ts
const facets: FacetConfig<MyRow>[] = [
  { key: "level", label: "Level", type: "enum",
    chipVariant: (v) => v === "error" ? "danger" : "info" },
  { key: "service", label: "Service", type: "string" },
  // ...
];
<FacetSearch rows={rows} facets={facets} onFilteredChange={setRows} />
```

`accessor` and `formatChipValue` / `formatOptionValue` cover the cases where the displayed
key differs from the data property (e.g., `status` → `row.statusCode`).

### State model

Rather than parsing one big query string, the hook tracks **committed tokens** and a
**draft string** separately. The draft is parsed every render — `method:GET` becomes
`{ mode: "value", facetKey: "method", partial: "GET" }`, anything else falls through to
idle mode. This means a chip commit is a single `setTokens` + `setInputValue('')` — no
state-machine, nothing to drift out of sync.

### Accessibility

- Full WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`, `aria-autocomplete="list"`. The listbox uses `role="listbox"`
  with `role="option"` rows.
- Focus stays on the input throughout — Floating UI's `useListNavigation` runs in `virtual`
  mode and updates the active descendant rather than moving DOM focus.
- A `role="status" aria-live="polite"` region announces the filtered row count for screen
  readers.

### Why these dependencies

- **`@floating-ui/react`** — anchored dropdown positioning (offset / flip / shift / size),
  scroll/resize tracking via `autoUpdate`, ARIA-correct list navigation. The same primitive
  Linear, GitHub, and Radix use; rolling these by hand is where most takehomes drop quality.
- That's it. The fuzzy matcher (`match.ts`, ~80 lines) is in-tree because deterministic
  ranking + cheap highlight ranges matter more than the breadth of `fuse.js` for the
  cardinalities we care about.

## How this would be productionised

The component is shaped so the only thing that changes for "millions of logs, many facets"
is *who provides the facets and values* — none of the UI changes.

1. **Server-driven facets.** `FacetConfig<T>[]` becomes whatever `/facets` returns. The
   backend pre-aggregates distinct values per facet (Elasticsearch `terms` aggregation /
   ClickHouse `GROUP BY`). Cardinality is sent alongside so we can surface high-cardinality
   facets differently (no full enumeration, search-only).
2. **Async lazy values.** Replace the sync `uniqueValuesForFacet` with a resolver
   `(facetKey, partial) => Promise<{values, total, hasMore}>`. Debounce input by 150 ms,
   show skeletons in the dropdown, cache responses with SWR / React Query keyed on
   `(facetKey, partial)`. Cancel inflight requests with `AbortController` on next keystroke.
3. **Virtualised dropdown.** Once an item count crosses ~50, swap the listbox `<ul>` for
   `@tanstack/react-virtual`. Keeps frame time flat when a facet has thousands of distinct
   values.
4. **Server-side filtering.** Tokens already serialise cleanly to a query DSL —
   `tokens.map(t => `${t.facetKey}:${t.value}`).join(' ')` is one line. Local filtering
   becomes the small-dataset fallback. The DSL extends naturally to the operators DataDog
   exposes (`AND`, `OR`, `NOT`, `(...)`, ranges, wildcards) — the token model already
   supports it; only the parser would need to ship.
5. **Persistence.** Tokens ↔ URL `?q=...` (deep links / shareable filters). Recent queries
   go server-side per user once we have user accounts; saved views likewise.
6. **Telemetry.** Emit `facet_search.committed` and `facet_search.abandoned_after_ms`
   events so PM can see which facets actually get used.
7. **Defensive cardinality cap.** Even with virtualisation, refuse to render more than
   ~10k items — force the user to type to narrow first.

These are *additive* changes; the public surface (`<FacetSearch rows facets onFilteredChange />`)
doesn't shift.

## What's deliberately out of scope

- Full boolean / parens DSL — the token model supports it (wildcards already ship), but
  explicit `NOT` and grouped expressions are left for the productionisation step. v1 is
  AND across facets, OR within a facet, plus glob wildcards.
- Numeric range support (`status:>=400`) — straightforward extension once an `op` is added
  to `Token`.
- Server-side saved views — `useSavedViews` is `localStorage`-backed; swap the storage
  layer for a fetch-based one without touching the UI.
- Virtualised dropdown — only matters past ~50 items; demo dataset has ≤10 per facet.
- Unit tests — the pure layer (`parse`, `filter`, `match`, `relativeTime`,
  `compilePattern`) is shaped for them, but they're not wired up.

## AI tooling disclosure

This implementation was built with significant AI assistance — Claude (Anthropic) was used
end-to-end: research (DataDog search syntax, ARIA combobox patterns, Floating UI APIs),
architectural plan, component scaffolding, fuzzy matcher, styling, and browser-driven
verification. I directed the work — chose the scope, the visual direction, the dependency
trade-offs (Floating UI yes, `cmdk`/`fuse.js` no), and the productionisation framing — and
reviewed each pass before keeping it.
