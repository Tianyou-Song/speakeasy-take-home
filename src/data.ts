import { HttpLog } from "./types";

// 70-row sample fixture intended to give the facet search a realistic mix
// of methods, status codes, domains, and paths to demo against.
// In production, this dataset would be streamed from an aggregation backend.
export const data: HttpLog[] = [
  // --- speakeasy.com (marketing site) ---
  { id: "1", domain: "speakeasy.com", method: "GET", path: "/", statusCode: 200 },
  { id: "2", domain: "speakeasy.com", method: "GET", path: "/pricing", statusCode: 200 },
  { id: "3", domain: "speakeasy.com", method: "GET", path: "/docs", statusCode: 200 },
  { id: "4", domain: "speakeasy.com", method: "GET", path: "/docs/quickstart", statusCode: 200 },
  { id: "5", domain: "speakeasy.com", method: "GET", path: "/blog", statusCode: 200 },
  { id: "6", domain: "speakeasy.com", method: "GET", path: "/blog/launching-sdk-gen", statusCode: 200 },
  { id: "7", domain: "speakeasy.com", method: "GET", path: "/favicon.ico", statusCode: 200 },
  { id: "8", domain: "speakeasy.com", method: "GET", path: "/robots.txt", statusCode: 200 },
  { id: "9", domain: "speakeasy.com", method: "GET", path: "/old-pricing", statusCode: 301 },
  { id: "10", domain: "speakeasy.com", method: "GET", path: "/missing-page", statusCode: 404 },

  // --- api.speakeasy.com (product API) ---
  { id: "11", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/auth/login", statusCode: 200 },
  { id: "12", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/auth/login", statusCode: 401 },
  { id: "13", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/auth/refresh", statusCode: 200 },
  { id: "14", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/auth/refresh", statusCode: 401 },
  { id: "15", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/users", statusCode: 200 },
  { id: "16", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/users/usr_42", statusCode: 200 },
  { id: "17", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/users/usr_99", statusCode: 404 },
  { id: "18", domain: "api.speakeasy.com", method: "PATCH", path: "/api/v1/users/usr_42", statusCode: 200 },
  { id: "19", domain: "api.speakeasy.com", method: "DELETE", path: "/api/v1/users/usr_42", statusCode: 204 },
  { id: "20", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/workspaces", statusCode: 201 },
  { id: "21", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/workspaces/wsp_1", statusCode: 200 },
  { id: "22", domain: "api.speakeasy.com", method: "PUT", path: "/api/v1/workspaces/wsp_1", statusCode: 200 },
  { id: "23", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/sdks/generate", statusCode: 201 },
  { id: "24", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/sdks/generate", statusCode: 500 },
  { id: "25", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/sdks/sdk_abc/status", statusCode: 200 },
  { id: "26", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/sdks/sdk_abc/download", statusCode: 200 },
  { id: "27", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/sdks", statusCode: 200 },
  { id: "28", domain: "api.speakeasy.com", method: "DELETE", path: "/api/v1/sdks/sdk_old", statusCode: 204 },
  { id: "29", domain: "api.speakeasy.com", method: "DELETE", path: "/api/v1/sdks/sdk_missing", statusCode: 404 },
  { id: "30", domain: "api.speakeasy.com", method: "POST", path: "/webhooks/github", statusCode: 200 },
  { id: "31", domain: "api.speakeasy.com", method: "POST", path: "/webhooks/github", statusCode: 401 },
  { id: "32", domain: "api.speakeasy.com", method: "POST", path: "/webhooks/stripe", statusCode: 200 },
  { id: "33", domain: "api.speakeasy.com", method: "GET", path: "/health", statusCode: 200 },
  { id: "34", domain: "api.speakeasy.com", method: "GET", path: "/health", statusCode: 503 },
  { id: "35", domain: "api.speakeasy.com", method: "GET", path: "/metrics", statusCode: 200 },
  { id: "36", domain: "api.speakeasy.com", method: "POST", path: "/api/v1/api-keys", statusCode: 201 },
  { id: "37", domain: "api.speakeasy.com", method: "DELETE", path: "/api/v1/api-keys/key_xyz", statusCode: 204 },
  { id: "38", domain: "api.speakeasy.com", method: "PUT", path: "/api/v1/users/usr_42/avatar", statusCode: 200 },
  { id: "39", domain: "api.speakeasy.com", method: "PUT", path: "/api/v1/users/usr_42/avatar", statusCode: 400 },
  { id: "40", domain: "api.speakeasy.com", method: "GET", path: "/api/v1/search?q=billing", statusCode: 200 },

  // --- app.speakeasy.com (admin dashboard) ---
  { id: "41", domain: "app.speakeasy.com", method: "GET", path: "/admin/dashboard", statusCode: 200 },
  { id: "42", domain: "app.speakeasy.com", method: "GET", path: "/admin/dashboard", statusCode: 403 },
  { id: "43", domain: "app.speakeasy.com", method: "GET", path: "/admin/users", statusCode: 403 },
  { id: "44", domain: "app.speakeasy.com", method: "GET", path: "/admin/feature-flags", statusCode: 200 },
  { id: "45", domain: "app.speakeasy.com", method: "PATCH", path: "/admin/feature-flags/ff_dark", statusCode: 200 },
  { id: "46", domain: "app.speakeasy.com", method: "POST", path: "/admin/audit-log", statusCode: 201 },

  // --- cdn.speakeasy.com (static assets) ---
  { id: "47", domain: "cdn.speakeasy.com", method: "GET", path: "/assets/logo.svg", statusCode: 200 },
  { id: "48", domain: "cdn.speakeasy.com", method: "GET", path: "/assets/hero.png", statusCode: 200 },
  { id: "49", domain: "cdn.speakeasy.com", method: "GET", path: "/assets/missing.png", statusCode: 404 },
  { id: "50", domain: "cdn.speakeasy.com", method: "GET", path: "/static/main.css", statusCode: 200 },
  { id: "51", domain: "cdn.speakeasy.com", method: "GET", path: "/static/main.js", statusCode: 200 },

  // --- api.openai.com ---
  { id: "52", domain: "api.openai.com", method: "POST", path: "/v1/chat/completions", statusCode: 200 },
  { id: "53", domain: "api.openai.com", method: "POST", path: "/v1/chat/completions", statusCode: 429 },
  { id: "54", domain: "api.openai.com", method: "POST", path: "/v1/chat/completions", statusCode: 500 },
  { id: "55", domain: "api.openai.com", method: "GET", path: "/v1/models", statusCode: 200 },
  { id: "56", domain: "api.openai.com", method: "POST", path: "/v1/embeddings", statusCode: 200 },

  // --- api.stripe.com ---
  { id: "57", domain: "api.stripe.com", method: "POST", path: "/v1/customers", statusCode: 201 },
  { id: "58", domain: "api.stripe.com", method: "GET", path: "/v1/customers/cus_Nffr", statusCode: 200 },
  { id: "59", domain: "api.stripe.com", method: "POST", path: "/v1/charges", statusCode: 200 },
  { id: "60", domain: "api.stripe.com", method: "POST", path: "/v1/charges", statusCode: 402 },
  { id: "61", domain: "api.stripe.com", method: "POST", path: "/v1/payment_intents", statusCode: 200 },
  { id: "62", domain: "api.stripe.com", method: "GET", path: "/v1/balance", statusCode: 200 },
  { id: "63", domain: "api.stripe.com", method: "POST", path: "/v1/refunds", statusCode: 200 },

  // --- api.github.com ---
  { id: "64", domain: "api.github.com", method: "GET", path: "/repos/speakeasy-api/sdk", statusCode: 200 },
  { id: "65", domain: "api.github.com", method: "GET", path: "/repos/speakeasy-api/private", statusCode: 404 },
  { id: "66", domain: "api.github.com", method: "GET", path: "/user", statusCode: 200 },
  { id: "67", domain: "api.github.com", method: "GET", path: "/user", statusCode: 401 },
  { id: "68", domain: "api.github.com", method: "POST", path: "/repos/speakeasy-api/sdk/issues", statusCode: 201 },

  // --- vercel.com ---
  { id: "69", domain: "vercel.com", method: "GET", path: "/api/projects", statusCode: 200 },
  { id: "70", domain: "vercel.com", method: "GET", path: "/api/deployments", statusCode: 200 },
  { id: "71", domain: "vercel.com", method: "POST", path: "/api/deployments", statusCode: 201 },
  { id: "72", domain: "vercel.com", method: "GET", path: "/api/deployments/dep_xyz", statusCode: 500 },

  // --- sentry.io ---
  { id: "73", domain: "sentry.io", method: "GET", path: "/api/v1/issues", statusCode: 200 },
  { id: "74", domain: "sentry.io", method: "POST", path: "/api/v1/events", statusCode: 200 },
  { id: "75", domain: "sentry.io", method: "GET", path: "/api/v1/issues/iss_123/events", statusCode: 200 },
];
