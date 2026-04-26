import type { Draft, FacetConfig } from "./types";

export function parseDraft<T>(
  input: string,
  facets: FacetConfig<T>[],
): Draft {
  const colonIdx = input.indexOf(":");
  if (colonIdx === -1) return { mode: "idle", text: input };

  const head = input.slice(0, colonIdx);
  const tail = input.slice(colonIdx + 1);
  if (!facets.some((f) => f.key === head)) {
    return { mode: "idle", text: input };
  }
  return { mode: "value", facetKey: head, partial: tail };
}

let tokenIdSeq = 0;
export function nextTokenId(): string {
  tokenIdSeq += 1;
  return `tok_${Date.now().toString(36)}_${tokenIdSeq}`;
}
