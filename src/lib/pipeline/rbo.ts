/**
 * Rank-biased overlap (Webber et al., 2010), evaluated to the depth of the longer list so items that
 * drop out of one ranking lower the score. Normalised so identical lists score 1. `p` weights the top
 * of the ranking: 0.9 puts ~86% of the weight on the first 10 ranks.
 */
export function rbo<T>(a: T[], b: T[], p = 0.9): number {
  const depth = Math.max(a.length, b.length);
  if (depth === 0) return 1;
  const seenA = new Set<T>();
  const seenB = new Set<T>();
  let overlap = 0;
  let sum = 0;
  let weights = 0;
  for (let d = 1; d <= depth; d++) {
    const x = a[d - 1];
    const y = b[d - 1];
    if (d <= a.length) {
      if (seenB.has(x)) overlap++;
      seenA.add(x);
    }
    if (d <= b.length) {
      if (seenA.has(y)) overlap++;
      seenB.add(y);
    }
    const w = p ** (d - 1);
    sum += w * (overlap / d);
    weights += w;
  }
  return sum / weights;
}
