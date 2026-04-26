export interface MatchResult {
  score: number;
  ranges: [number, number][];
}

const WORD_BOUNDARY = /[\s\-_/.@:]/;

export function fuzzyMatch(query: string, target: string): MatchResult | null {
  if (!query) return { score: 0, ranges: [] };
  if (!target) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.startsWith(q)) {
    return {
      score: 1000 - (target.length - query.length),
      ranges: [[0, query.length]],
    };
  }

  const indices: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  if (qi !== q.length) return null;

  let score = 0;
  let runLen = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];

    if (target[idx] === query[i]) score += 1;
    if (idx === 0 || WORD_BOUNDARY.test(target[idx - 1])) score += 5;

    if (i > 0 && indices[i - 1] === idx - 1) {
      runLen += 1;
      score += 4 + runLen;
    } else {
      runLen = 0;
    }

    score += Math.max(0, 20 - idx);
  }

  score -= Math.max(0, target.length - indices[indices.length - 1] - 1) * 0.1;

  return { score, ranges: indicesToRanges(indices) };
}

function indicesToRanges(indices: number[]): [number, number][] {
  if (indices.length === 0) return [];
  const ranges: [number, number][] = [];
  let start = indices[0];
  let end = indices[0] + 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === end) {
      end += 1;
    } else {
      ranges.push([start, end]);
      start = indices[i];
      end = indices[i] + 1;
    }
  }
  ranges.push([start, end]);
  return ranges;
}
