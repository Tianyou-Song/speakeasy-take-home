import type { Aggregation, Op, Token } from "../types";
import type {
  NLEngine,
  NLEngineStatus,
  NLFacetSchema,
  NLLoadProgress,
  NLProgressCallback,
} from "./types";

// Qwen2.5-3B picked for reliable JSON on the new conditional+nested schema
// (intent + optional aggregation). Falls back to Llama-3.2-3B on hardware failure.
const PRIMARY_MODEL = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
const FALLBACK_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

// Approximate post-quantization download size per model id, in bytes. Lets the
// loading UI render a `540 MB / 2.0 GB` line without waiting for WebLLM to
// finish enumerating shards. If the active model isn't here, the bytes-total
// portion of the UI is silently omitted.
const MODEL_TOTAL_BYTES: Record<string, number> = {
  [PRIMARY_MODEL]: 2.0 * 1024 ** 3, // ~2.0 GB
  [FALLBACK_MODEL]: 1.8 * 1024 ** 3, // ~1.8 GB
};

// localStorage flag toggled to "1" the first time a load completes successfully.
// Drives the cold-vs-warm "First-time setup" subtitle.
const FIRST_LOAD_KEY = "nl:loaded:v1";

function readFirstLoadFlag(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FIRST_LOAD_KEY) !== "1";
  } catch {
    return true;
  }
}

function markLoaded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIRST_LOAD_KEY, "1");
  } catch {
    // localStorage may be disabled (private mode); subtitle just keeps showing.
  }
}

let isFirstLoadCached: boolean = readFirstLoadFlag();

// Parse "1629MB fetched" / "1.5 GB fetched" / "540 MB fetched" out of WebLLM's
// verbose progress text. Returns bytes or undefined if the format changes.
function parseBytesFromText(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)\s*(?:fetched|loaded|downloaded)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = m[2].toUpperCase();
  const mult: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return n * (mult[unit] ?? 1);
}

const SYSTEM_PROMPT = `You translate natural-language search queries into a structured JSON object for an HTTP-log search interface.

Available facets (the only valid facetKey values):
- "method" (enum): GET, POST, PUT, DELETE, PATCH
- "status" (number): integer 100-599 OR a wildcard pattern using * (e.g. "5*" matches all 5xx, "4*" all 4xx)
- "domain" (string): a substring/wildcard match against domains like "speakeasy.com", "api.speakeasy.com", "api.openai.com"
- "path" (string): a substring/wildcard match against URL paths like "/api/v1/users"

Output schema (return ONLY this JSON object — no commentary, no markdown fences, no explanations):
{
  "intent": "filter" | "analytical",
  "tokens": [ { "facetKey": "method"|"status"|"domain"|"path", "value": "...", "isPattern": true|false, "negated"?: true|false, "op"?: ">"|">="|"<"|"<="|".." } ],
  "aggregation": null | {
    "groupBy": "method"|"status"|"domain"|"path",
    "aggregator": "count",
    "orderBy": "count_desc"|"count_asc",
    "limit": 5
  }
}

Phrase mapping:
- "endpoint" / "url" / "route" / "page" -> facetKey "path"
- "service" / "host" / "origin" -> facetKey "domain"
- "verb" / "http method" / "method" -> facetKey "method"
- "code" / "response code" / "status code" -> facetKey "status"

Filter rules (apply to the tokens array):
- "isPattern" is true when value contains "*"; false otherwise
- "method" values are uppercase: GET, POST, PUT, DELETE, PATCH
- "status" values are strings: "200", "404", or wildcards "5*", "4*", "3*", "2*", "1*"
- "errors" / "failing" / "failed" / "broken" -> { "facetKey": "status", "value": "5*", "isPattern": true }
- "success" / "successful" / "ok" / "200s" -> { "facetKey": "status", "value": "2*", "isPattern": true }
- "redirects" / "3xx" -> { "facetKey": "status", "value": "3*", "isPattern": true }
- Path keywords (auth, login, payment, admin, health, dashboard, webhook, sdk, user, metric, blog, doc) -> { "facetKey": "path", "value": "*<keyword>*", "isPattern": true }

Negation and range rules (apply to filter tokens):
- "negated": true when the user explicitly excludes a value with words like "not", "except", "excluding", "without", "no", "anything but", "other than".
  Example: "not 5xx" -> { "facetKey": "status", "value": "5*", "isPattern": true, "negated": true }
- "op" is set on numeric facets (only "status") for comparison phrases:
  - "above" / "over" / "more than" / "greater than"  -> ">"
  - "at least" / ">=" / "or more"                    -> ">="
  - "below" / "under" / "less than"                  -> "<"
  - "at most" / "<=" / "or less"                     -> "<="
  - "between X and Y" / "X to Y" / "X..Y"            -> ".." with value "X..Y"
- When "op" is set, "isPattern" is false and "value" is the numeric string ("400") or the "lo..hi" form for "..".
- Set "op" ONLY on "status" — never on method/domain/path.
- A token cannot have both "isPattern": true and a non-empty "op". Pick one.
- "negated" can combine with "op" or "isPattern" — e.g. "everything except between 200 and 299" -> negated:true, op:"..", value:"200..299".

Intent + aggregation rules:
- intent is "analytical" when the query asks "which", "top N", "most", "least", "highest", "lowest", "rank", "by frequency", "ratio", or otherwise wants a grouped/ranked answer.
- intent is "filter" when the query just narrows the rows ("show me X", "5xx errors", "GET to auth").
- When intent is "filter", aggregation MUST be null.
- When intent is "analytical", aggregation MUST be an object with all four fields filled in.
- "most frequently" / "most common" / "top N" -> orderBy "count_desc"
- "least common" / "rarest" / "least frequently" -> orderBy "count_asc"
- "top 3" -> limit 3; "top 10" -> limit 10; default limit 5 if not specified.
- An analytical query can ALSO have filter tokens (e.g. "which endpoint fails most" -> filter status:5* AND aggregation by path).
- If query cannot be mapped to any facet, output: { "intent": "filter", "tokens": [], "aggregation": null }`;

const FEW_SHOT: ReadonlyArray<{ user: string; assistant: string }> = [
  {
    user: "failing payment requests",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"path","value":"*payment*","isPattern":true},{"facetKey":"status","value":"5*","isPattern":true}],"aggregation":null}`,
  },
  {
    user: "5xx errors from api.speakeasy.com",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"domain","value":"api.speakeasy.com","isPattern":false},{"facetKey":"status","value":"5*","isPattern":true}],"aggregation":null}`,
  },
  {
    user: "GET requests to auth",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"method","value":"GET","isPattern":false},{"facetKey":"path","value":"*auth*","isPattern":true}],"aggregation":null}`,
  },
  {
    user: "successful POSTs",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"method","value":"POST","isPattern":false},{"facetKey":"status","value":"2*","isPattern":true}],"aggregation":null}`,
  },
  {
    user: "which endpoint fails most frequently?",
    assistant: `{"intent":"analytical","tokens":[{"facetKey":"status","value":"5*","isPattern":true}],"aggregation":{"groupBy":"path","aggregator":"count","orderBy":"count_desc","limit":5}}`,
  },
  {
    user: "top 3 domains by traffic",
    assistant: `{"intent":"analytical","tokens":[],"aggregation":{"groupBy":"domain","aggregator":"count","orderBy":"count_desc","limit":3}}`,
  },
  {
    user: "least common status code",
    assistant: `{"intent":"analytical","tokens":[],"aggregation":{"groupBy":"status","aggregator":"count","orderBy":"count_asc","limit":1}}`,
  },
  {
    user: "most frequent http verb on api.speakeasy.com",
    assistant: `{"intent":"analytical","tokens":[{"facetKey":"domain","value":"api.speakeasy.com","isPattern":false}],"aggregation":{"groupBy":"method","aggregator":"count","orderBy":"count_desc","limit":1}}`,
  },
  {
    user: "everything except 5xx",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"status","value":"5*","isPattern":true,"negated":true}],"aggregation":null}`,
  },
  {
    user: "status above 400",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"status","value":"400","isPattern":false,"op":">"}],"aggregation":null}`,
  },
  {
    user: "status between 200 and 299",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"status","value":"200..299","isPattern":false,"op":".."}],"aggregation":null}`,
  },
  {
    user: "GET requests not to auth",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"method","value":"GET","isPattern":false},{"facetKey":"path","value":"*auth*","isPattern":true,"negated":true}],"aggregation":null}`,
  },
  {
    // Explicit union phrasing — same-facet OR. The model produces two
    // domain tokens, which the chip rail renders with an inline "or"
    // connector and the simple-mode evaluator OR's together within the
    // facet. Reduces variance vs. relying on training prior alone.
    user: "requests to speakeasy or openai",
    assistant: `{"intent":"filter","tokens":[{"facetKey":"domain","value":"*speakeasy*","isPattern":true},{"facetKey":"domain","value":"*openai*","isPattern":true}],"aggregation":null}`,
  },
];

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface RawToken {
  facetKey?: unknown;
  value?: unknown;
  isPattern?: unknown;
  negated?: unknown;
  op?: unknown;
}

const VALID_OPS: ReadonlySet<string> = new Set([">", ">=", "<", "<=", ".."]);

interface MLCEngineLike {
  chat: {
    completions: {
      create(req: {
        messages: ChatMessage[];
        temperature?: number;
        max_tokens?: number;
      }): Promise<{
        choices: Array<{ message: { content: string | null } }>;
      }>;
    };
  };
}

interface InitProgressReport {
  progress: number;
  text: string;
  timeElapsed?: number;
}

let enginePromise: Promise<MLCEngineLike> | null = null;
let engineStatus: NLEngineStatus = "cold";
const progressSubscribers = new Set<NLProgressCallback>();
let lastProgress: NLLoadProgress | null = null;

function emitProgress(p: NLLoadProgress): void {
  lastProgress = p;
  for (const cb of progressSubscribers) cb(p);
}

async function loadModel(modelId: string): Promise<MLCEngineLike> {
  // Lazy import keeps the SDK out of the main bundle until NL is actually used.
  const mod = await import("@mlc-ai/web-llm");
  const bytesTotal = MODEL_TOTAL_BYTES[modelId];
  const engine = await mod.CreateMLCEngine(modelId, {
    initProgressCallback: (report: InitProgressReport) => {
      const eta =
        report.progress > 0 && report.progress < 1 && report.timeElapsed
          ? Math.max(
              0,
              Math.round(
                (report.timeElapsed / report.progress) * (1 - report.progress),
              ),
            )
          : undefined;
      const bytesLoaded = parseBytesFromText(report.text);
      emitProgress({
        progress: report.progress,
        text: report.text,
        etaSec: eta,
        isFirstLoad: isFirstLoadCached,
        bytesLoaded,
        bytesTotal,
      });
    },
  });
  return engine as unknown as MLCEngineLike;
}

async function ensureEngine(): Promise<MLCEngineLike> {
  if (enginePromise) return enginePromise;
  engineStatus = "loading";
  enginePromise = (async () => {
    try {
      const engine = await loadModel(PRIMARY_MODEL);
      engineStatus = "ready";
      markLoaded();
      isFirstLoadCached = false;
      emitProgress({
        progress: 1,
        text: "Ready",
        isFirstLoad: false,
        bytesTotal: MODEL_TOTAL_BYTES[PRIMARY_MODEL],
        bytesLoaded: MODEL_TOTAL_BYTES[PRIMARY_MODEL],
      });
      return engine;
    } catch (primaryErr) {
      console.warn(
        `[NL] Primary model (${PRIMARY_MODEL}) failed, retrying with fallback:`,
        primaryErr,
      );
      try {
        const engine = await loadModel(FALLBACK_MODEL);
        engineStatus = "ready";
        markLoaded();
        isFirstLoadCached = false;
        emitProgress({
          progress: 1,
          text: "Ready",
          isFirstLoad: false,
          bytesTotal: MODEL_TOTAL_BYTES[FALLBACK_MODEL],
          bytesLoaded: MODEL_TOTAL_BYTES[FALLBACK_MODEL],
        });
        return engine;
      } catch (fallbackErr) {
        engineStatus = "failed";
        enginePromise = null; // allow retry on next user gesture
        emitProgress({
          progress: 0,
          text: "Failed",
          isFirstLoad: isFirstLoadCached,
        });
        throw fallbackErr;
      }
    }
  })();
  return enginePromise;
}

function buildMessages(query: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const ex of FEW_SHOT) {
    messages.push({ role: "user", content: ex.user });
    messages.push({ role: "assistant", content: ex.assistant });
  }
  messages.push({ role: "user", content: query });
  return messages;
}

function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

let nlTokenSeq = 0;
function nextNLTokenId(): string {
  nlTokenSeq += 1;
  return `nl_${Date.now().toString(36)}_${nlTokenSeq}`;
}

function validateTokens(parsed: unknown, facets: NLFacetSchema): Token[] {
  if (!parsed || typeof parsed !== "object") return [];
  const rawTokens = (parsed as { tokens?: unknown }).tokens;
  if (!Array.isArray(rawTokens)) return [];
  const facetByKey = new Map(facets.map((f) => [f.key, f]));
  const out: Token[] = [];
  for (const item of rawTokens) {
    if (!item || typeof item !== "object") continue;
    const t = item as RawToken;
    if (typeof t.facetKey !== "string" || typeof t.value !== "string") continue;
    const facet = facetByKey.get(t.facetKey);
    if (!facet) continue;
    const value = t.value.trim();
    if (!value) continue;

    const negated = t.negated === true;

    // Only accept "op" if the model produced a known operator AND the facet
    // is numeric. Unknown ops or ops on string/enum facets fall back to
    // equality / wildcard, matching how the typed parser treats them.
    let op: Op | undefined;
    if (typeof t.op === "string" && VALID_OPS.has(t.op) && facet.type === "number") {
      op = t.op as Op;
    }

    // Range/comparator value must be numerically well-formed; otherwise drop
    // the op and let the value stand on its own (so we never produce a token
    // that the filter chokepoint can't satisfy).
    if (op === "..") {
      const [lo, hi] = value.split("..").map(Number);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) op = undefined;
    } else if (op) {
      if (!Number.isFinite(Number(value))) op = undefined;
    }

    const isPattern = !op && (t.isPattern === true || value.includes("*"));

    const tok: Token = { id: nextNLTokenId(), facetKey: t.facetKey, value };
    if (isPattern) tok.isPattern = true;
    if (negated) tok.negated = true;
    if (op) tok.op = op;
    out.push(tok);
  }
  return out;
}

function validateAggregation(
  parsed: unknown,
  facets: NLFacetSchema,
): Aggregation | null {
  if (!parsed || typeof parsed !== "object") return null;
  const raw = (parsed as { aggregation?: unknown }).aggregation;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as {
    groupBy?: unknown;
    aggregator?: unknown;
    orderBy?: unknown;
    limit?: unknown;
  };
  if (typeof r.groupBy !== "string") return null;
  const known = new Set(facets.map((f) => f.key));
  if (!known.has(r.groupBy)) return null;
  const orderBy: Aggregation["orderBy"] =
    r.orderBy === "count_asc" ? "count_asc" : "count_desc";
  const rawLimit = typeof r.limit === "number" ? r.limit : Number(r.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(20, Math.floor(rawLimit)))
    : 5;
  return {
    groupBy: r.groupBy,
    aggregator: "count",
    orderBy,
    limit,
  };
}

async function callOnce(
  engine: MLCEngineLike,
  messages: ChatMessage[],
): Promise<string> {
  const reply = await engine.chat.completions.create({
    messages,
    temperature: 0.0,
    max_tokens: 256,
  });
  return reply.choices[0]?.message?.content ?? "";
}

export const llmEngine: NLEngine = {
  get status() {
    return engineStatus;
  },
  async warmup() {
    await ensureEngine();
  },
  async parse(text, facets) {
    const engine = await ensureEngine();
    let messages = buildMessages(text);
    let lastErr: string | null = null;

    for (let attempt = 0; attempt <= 2; attempt++) {
      const raw = await callOnce(engine, messages);
      const cleaned = stripFences(raw);
      try {
        const parsed = JSON.parse(cleaned);
        return {
          tokens: validateTokens(parsed, facets),
          aggregation: validateAggregation(parsed, facets),
        };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        // Append the bad output and a corrective nudge for the next attempt.
        messages = [
          ...messages,
          { role: "assistant", content: cleaned },
          {
            role: "user",
            content: `That was not valid JSON (${lastErr}). Output ONLY a JSON object of shape { "intent": "...", "tokens": [...], "aggregation": null|{...} } with no commentary, no fences, no extra keys.`,
          },
        ];
      }
    }
    console.warn(`[NL] Parse failed after retries: ${lastErr}`);
    return { tokens: [], aggregation: null };
  },
  subscribeProgress(cb) {
    progressSubscribers.add(cb);
    if (lastProgress) cb(lastProgress);
    return () => {
      progressSubscribers.delete(cb);
    };
  },
};
