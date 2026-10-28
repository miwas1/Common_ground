// Content rules for model-written prose (PLAN.md §4.1). Model output that breaks them is
// rejected with specific messages and the model is asked to try again.

export type Issue = { path: string; message: string };

const NUMBERS = /\d|%/;
const SUPERLATIVES =
  /\b(most|strongest|best|highest|lowest|top|biggest|largest|leading|guaranteed?|proven|definitely|certainly|always|never fails)\b|#\s?\d/i;
const FORBIDDEN_CLAIMS: [RegExp, string][] = [
  [/\b(purchase|buying|buy)\s+intent\b|\bwill\s+(buy|purchase|convert)\b|\blikely\s+to\s+(buy|purchase|convert)\b/i, "predicts purchasing"],
  [/\bconver(t|ts|sion|sions)\b|\bsales\s+lift\b|\broi\b|\bctr\b|\bengagement\s+rate\b/i, "predicts performance"],
  [/\bprove[sn]?\b|\bguarantee/i, "claims proof or certainty"],
  [/\b(their|her|his|the creator'?s)\s+(followers|audience|fans)\s+(like|love|prefer|enjoy|want)/i, "attributes tastes to a creator's followers"],
  [/\b(each|every)\s+(customer|person|user|individual)\b|\bindividual\s+(customers|people|users)\b/i, "describes individuals rather than aggregates"],
];

/** The same rules, stated for the model in every prompt that produces interpretations. */
export const PROSE_RULES = `Interpretations (and any text marked as a reading of evidence) must:
- contain no digits or percent signs;
- avoid these words entirely: most, strongest, best, highest, lowest, top, biggest, largest, leading, guaranteed, proven, definitely, certainly, always;
- never predict buying, conversion, sales, ROI, CTR or engagement, never claim proof or certainty, never describe what a creator's followers like, and never describe individuals (Qloo describes aggregate affinities);
- be hedged readings ("could", "suggests", "may").`;

/** Rules for an interpretation: no numbers, no superlatives, no forbidden claims. */
export function checkInterpretation(text: string, path: string): Issue[] {
  const issues: Issue[] = [];
  const number = text.match(NUMBERS);
  if (number) issues.push({ path, message: `contains “${number[0]}”; numbers belong in cited findings, not interpretations` });
  const superlative = text.match(SUPERLATIVES);
  if (superlative) issues.push({ path, message: `uses “${superlative[0]}”, a superlative or ranking word; rephrase without it` });
  issues.push(...checkClaims(text, path));
  return issues;
}

/** Rules for creative copy (hooks, beats, titles): creative freedom, but no forbidden claims. */
export function checkClaims(text: string, path: string): Issue[] {
  return FORBIDDEN_CLAIMS.flatMap(([re, why]) => {
    const m = text.match(re);
    return m ? [{ path, message: `“${m[0]}” ${why}; Common Ground reports aggregate affinities, not predictions or individual behaviour` }] : [];
  });
}

/** Every cited key must exist in the allowed set (evidence of this run, or this creator's portfolio). */
export function checkKeys(keys: string[], allowed: ReadonlySet<string>, path: string, min = 1): Issue[] {
  const issues: Issue[] = [];
  if (keys.length < min) issues.push({ path, message: `must cite at least ${min}` });
  for (const k of keys) if (!allowed.has(k)) issues.push({ path, message: `cites “${k}”, which is not in the provided list` });
  return issues;
}

export function formatIssues(issues: Issue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join("\n");
}
