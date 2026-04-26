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

## Natural-language search (Press `Space`)

Mirrors the affordance shown in the assignment's reference Datadog screenshot:

```
Filter your logs. Press `Space` to search using natural language queries.   ✨ Ask
```

- Press `Space` on an empty input — the bar switches to a violet "NL mode" with a
  prefix sparkle and the placeholder swaps to *"Describe what you're looking for…"*.
  No space character is inserted.
- Type a question (`failing payment requests`, `5xx errors from api.speakeasy.com`,
  `GET requests to auth`), press `Enter` (or click `✨ Ask`) — the parsed filter chips
  drop into the input and the table refreshes atomically.
- A small "Translated …" pill appears above the input with `Undo` / `Edit prompt`
  buttons; auto-dismisses after 6s, pauses on hover.
- Original NL is stored in the `recents` dropdown so the same query can be re-run.
- `Esc` or `Backspace` to empty exits NL mode. Free text + `Enter` (without pressing
  Space first) is a lenient fallback that routes to the same NL parser.

> **Divergence from Datadog (intentional).** Datadog's input does *three* things:
> structured queries (`service:foo`), free-text content search against the log
> `message` field, and NL via the `Ask` button. Our `HttpLog` is purely
> structured (no `message`/body field), so there is no content to free-text
> match against. Rather than make `Enter` on free text a no-op, we route it
> through the same NL parser — preserving discoverability for users who don't
> read the placeholder. Strict-mirror behavior would be a one-line change
> (drop the lenient branch in `handleInputKeyDown`); we keep the forgiving
> path because it pairs better with the small structured dataset.

The parser runs **entirely in the browser** — no API calls, no server. The
**Qwen2.5-3B-Instruct (q4f16_1)** model loads via
[WebLLM](https://github.com/mlc-ai/web-llm) eagerly on app mount (via
`requestIdleCallback`, deferred just past first paint) so by the time the
reviewer presses Space the model is usually already ready. If they beat the
download — easy to do on a fresh cache — the input swaps into a
`✨ Loading AI · 62% · ~18s` progress bar with a "First-time setup" subtitle;
otherwise the user goes straight to the parse with no visible loading state
(Cache Storage hit, <5s on subsequent visits).

> **Honest disclosure — production would look different.** Real Datadog
> doesn't ship Qwen weights to your browser; *Bits AI* runs server-side and
> the client just calls an authenticated API. We do it client-side here only
> because the take-home is a static page with no backend — running entirely
> in the browser is the simulation, not the architecture I'd recommend at
> any scale. Eager-loading the model on page mount also forces a ~2 GB
> download to Cache Storage even for users who never use NL search, which
> is fine for a demo on broadband but would be gated behind opt-in /
> `connection.effectiveType` / quota estimate in a shipping product. The
> server-side approach sidesteps both costs (model is always warm, client
> downloads nothing) and is what I'd build in production. The model is given a few-shot
prompt (system message + 6 input/output pairs) and told the live facet schema; its
JSON output is validated against the schema (unknown facets/values dropped) and
retried up to twice on parse failure (~5–8% empirical failure rate per
[JSONSchemaBench](https://github.com/guidance-ai/jsonschemabench)).

If the browser doesn't expose WebGPU, the feature degrades gracefully: the
`✨ Ask` button renders disabled with a tooltip, the placeholder reverts to the
facet-syntax hint, and typing a phrase + `Enter` shows an inline message in the
dropdown pointing at the structured affordances. Detection happens on mount via
`navigator.gpu.requestAdapter()` so the unavailable state is correct on first
paint instead of on first user gesture.

### Why this design (research-driven)

- **LLM-as-parser, not vectors.** With ~75 highly-structured records and no free-text
  body field, embeddings can't reason about ranges (`5xx`), exact codes (`404`), or
  conjunctions. Honeycomb Query Assistant, New Relic NRAI, MongoDB Compass,
  LlamaIndex's "self-query retriever" — every cited production case for
  NL-on-faceted-data goes LLM-as-parser. We follow.
- **`Qwen2.5-3B` over Qwen2.5-1.5B / Llama-3.2-3B.** The original 1.5B pick was
  sized for a filter-only schema (~5–8% JSON failure). Adding the analytical
  extension (conditional `intent` field + nested optional `aggregation` object +
  semantic phrase mapping) pushes 1.5B's failure rate to 15–25% per
  [JSONSchemaBench (2025)](https://arxiv.org/html/2501.10868v3) — too high for
  the 2× retry budget. Qwen2.5-3B holds at 8–12% per attempt. Cache cost goes
  from ~1.2 GB to ~2.0 GB, still well under our cap. Llama-3.2-3B is the
  hardware fallback if Qwen fails to instantiate.
- **Atomic apply + undo pill** synthesizes Datadog (atomic execution, no preview
  banner) with the wider industry's preview-and-trust convention (Honeycomb, Mode,
  Coralogix, Langfuse all retain the NL string somewhere). Atomic = Datadog speed;
  pill + recents = reversibility.
- **Chips identical to manual.** Langfuse, Linear, MongoDB Compass all explicitly do
  this. No "AI-suggested" badge, no dashed border. Once chips land, they behave
  exactly like user-added chips.
- **No Space-key in unavailable mode.** Don't advertise an affordance that doesn't
  work — *detect-early, signal-quietly, redirect-clearly* (Notion AI, GitHub Copilot,
  Linear's feature-availability surfacing).

### Analytical questions (aggregation)

The schema also carries an optional `aggregation` so analytical phrasings work,
not just filter ones. *"which endpoint fails most frequently?"* parses to a
`status:5*` filter chip **plus** a `📊 Top 5 by path` aggregation chip and a
horizontal-bar **Top-By panel** below the search bar — each row is the path,
its failure count, and a percentage. Click a row to add it as an equality
filter chip (the analytical answer becomes a filter pivot, the way Honeycomb's
heatmap-to-bubble drilldown works). Pure-filter queries continue to behave
exactly as before — aggregation is `null` when the LLM classifies the query as
a filter.

Mirrors Datadog's behavior, where queries like
`status:error | stats count() by service | limit 20` render a Top-List
visualization alongside log results.

Computation is deterministic JS over the *already-filtered* rows
(`aggregate.ts:topNBy`) — no extra LLM call, no extra latency. Aggregator is
`count` only for v1; the field is in the type so adding `avg`/`min`/`max`/`p95`
later is a localized change.

## Architecture

```
src/
  FuzzySearch.tsx              thin wrapper: declares the HttpLog facet config
  facet-search/
    FacetSearch.tsx            input shell + chip rail + Floating-UI dropdown
    FacetSuggestions.tsx       sectioned dropdown (Facets / Values / Saved / Recent / NL)
    FacetChip.tsx              colour-coded chip (italic + dashed for patterns)
    AskButton.tsx              ✨ Ask trigger; disabled state + tooltip when NL unavailable
    NLLoadingProgress.tsx      progress bar shown in the input while WebLLM downloads
    NLPill.tsx                 "Translated …" undo pill with auto-dismiss timer
    AggregationChip.tsx        "📊 Top 5 by path" chip-styled pill in the chip rail
    TopByPanel.tsx             horizontal-bar Top-N panel; click row -> add filter chip
    useFacetSearch.ts          state hook (tokens, draft, aggregation, topN, recents)
    useSavedViews.ts           saved-views hook (localStorage, separate key)
    parse.ts                   parseDraft(input) → { mode, facetKey?, partial }
    filter.ts                  filterRows + uniqueValuesForFacet + matchToken (wildcard)
    aggregate.ts               topNBy(rows, facet, agg) → ranked groups + counts + share
    match.ts                   subsequence fuzzy matcher with highlight ranges
    types.ts                   Token, FacetConfig, Aggregation, TopNRow, ChipVariant
    nl/
      capability.ts            detectWebGPU() — memoized one-shot check on mount
      types.ts                 NLEngine interface, NLLoadProgress, NLResult
      llm.ts                   singleton WebLLM engine (Qwen2.5-3B + Llama-3.2-3B fallback)
      index.ts                 parseNL / warmupNL / subscribeNLProgress public API
      examples.ts              EXAMPLE_NL_QUERIES rendered in the dropdown hint
      useNLSearch.ts           NL state hook (status, progress, arm/disarm/submit)
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
- **`@mlc-ai/web-llm`** — production-grade WebGPU runtime for browser-local LLMs.
  Dynamic-imported (`await import("@mlc-ai/web-llm")`) so Vite code-splits
  the ~5 MB SDK into its own chunk that's never in the main bundle. Both
  the SDK chunk and the Qwen2.5-3B model weights (~2 GB) are fetched
  eagerly on app mount via `requestIdleCallback` (deferred just past first
  paint), then persisted in Cache Storage so subsequent visits load from
  disk in <5 s.
- That's it. The fuzzy matcher (`match.ts`, ~80 lines) is in-tree because deterministic
  ranking + cheap highlight ranges matter more than the breadth of `fuse.js` for the
  cardinalities we care about.

`vite.config.ts` adds `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` so `crossOriginIsolated` is true,
unlocking `SharedArrayBuffer` for WebLLM threading on browsers that need it.

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

This implementation was built with significant AI assistance — Claude
(Anthropic) was the engineering pair. Worth being explicit about *how* it
was used, because this wasn't a one-shot prompt:

- **Iterative plan-→-review-→-approve-→-execute workflow.** Every
  non-trivial change was proposed as a plan I read and accepted (or
  rejected) before any code was written. Several plans were sent back
  for rework — most notably around how strictly to mirror Datadog vs.
  borrow from the wider industry's post-NL-parse UX patterns, whether
  to keep a heuristic-regex layer alongside the LLM, and which model
  to use once the output schema gained an analytical aggregation field.
- **Multiple independent research passes.** Claude dispatched background
  research agents to investigate, in parallel, (a) the browser-LLM
  landscape and model-selection benchmarks (StructEval, JSONSchemaBench,
  WebLLM prebuilt registry), (b) post-NL-parse UX across Honeycomb /
  Mode / Splunk / Linear / Langfuse / MongoDB Compass / Hex Magic, (c)
  Datadog-specific Logs Explorer and Bits AI behavior, and (d)
  browser-AI loading-UX patterns (Cursor, VS Code, GitHub Codespaces,
  Apple Intelligence, Chrome Gemini Nano). Each pass produced
  citation-heavy reports that informed the design.
- **Live testing surfaced gaps that drove follow-up work.** The first
  shipped cut was filter-only NL. Asking *"which endpoint fails most
  frequently?"* exposed that the analytical half of natural-language
  was being ignored — which drove the addition of aggregation as a
  first-class output and a model upgrade (Qwen2.5-1.5B → Qwen2.5-3B,
  because nested+conditional schemas exceed 1.5B's reliable JSON rate
  per JSONSchemaBench). A loading-bar layout overflow surfaced from a
  user screenshot triggered a research-backed loading-UX rework. A
  later observation that the cold-load wait landed on the worst possible
  moment — the reviewer's first try — drove the eager background
  warmup on mount.
- **Explicit value/scope decisions I made.** Keep the lenient
  free-text-Enter fallback even though Datadog content-searches message
  bodies (we don't have a message field, so routing to NL is the
  sensible adaptation). Add aggregation rather than just hint at the
  gap. Keep the undo pill on top of Datadog's atomic-execution mirror.
  Eager-load the model on mount despite the bandwidth cost.
- **Where I redirected the architecture.** Dropped vector embeddings
  and HNSW after research showed they're the wrong primary tool for
  small structured data. Dropped the heuristic-regex parser layer for
  a strict LLM-only Datadog mirror. Pushed back on options-menu
  responses and asked for committed recommendations.

**At runtime**, NL search uses **Qwen2.5-3B-Instruct** running entirely
in the browser via [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm)
— no server-side calls. The model emits structured filter tokens (and
optional aggregation specs for analytical questions) that flow through
the same `Token[]` pipeline manual chip selection uses.
