// Revision compare (PLAN.md §4.4): directions in two revisions are matched by the Qloo results
// they rest on (their anchor findings), never by title, since titles are rewritten on every run.

export type DirectionAnchors = { id: string; anchors: ReadonlySet<string> };
export type DirectionMatch = { a: string; b: string; shared: number; similarity: number };

/** Below this overlap two directions are treated as different ideas. */
export const MATCH_THRESHOLD = 0.2;

const jaccard = (x: ReadonlySet<string>, y: ReadonlySet<string>) => {
  let shared = 0;
  for (const v of x) if (y.has(v)) shared++;
  const union = x.size + y.size - shared;
  return { shared, similarity: union === 0 ? 0 : shared / union };
};

/** Greedy one-to-one matching, most similar pairs first. Unmatched directions were dropped (a) or are new (b). */
export function matchDirections(a: DirectionAnchors[], b: DirectionAnchors[]) {
  const pairs = a
    .flatMap((x) => b.map((y) => ({ a: x.id, b: y.id, ...jaccard(x.anchors, y.anchors) })))
    .filter((p) => p.similarity >= MATCH_THRESHOLD)
    .sort((p, q) => q.similarity - p.similarity || q.shared - p.shared);
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const matches: DirectionMatch[] = [];
  for (const p of pairs) {
    if (usedA.has(p.a) || usedB.has(p.b)) continue;
    usedA.add(p.a);
    usedB.add(p.b);
    matches.push(p);
  }
  return {
    matches,
    dropped: a.filter((x) => !usedA.has(x.id)).map((x) => x.id),
    added: b.filter((y) => !usedB.has(y.id)).map((y) => y.id),
  };
}

/** What changed in a list of names between two revisions. */
export function diffNames(before: string[], after: string[]) {
  const a = new Set(before);
  const b = new Set(after);
  return { removed: before.filter((x) => !b.has(x)), added: after.filter((x) => !a.has(x)), kept: after.filter((x) => a.has(x)) };
}
