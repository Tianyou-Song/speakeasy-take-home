// Surfaced as suggestions in the dropdown when NL mode is armed.
// Mix of filter, negation, range, and analytical questions so the user
// discovers each shape.
export const EXAMPLE_NL_QUERIES = [
  "failing payment requests",
  "5xx errors from api.speakeasy.com",
  "requests to speakeasy or openai",
  "all requests except 5xx",
  "status above 400",
  "which endpoint fails most frequently?",
  "top 3 domains",
  "GET requests to auth",
  "least common status code",
] as const;

export type ExampleNLQuery = (typeof EXAMPLE_NL_QUERIES)[number];
