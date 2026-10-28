// Stage 5 — synthesise 3–4 cultural directions from the evidence pool.
// The model selects evidence by key and writes interpretations; findings are rendered by code (§4.1).

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { claim, direction, evidence } from "@/db/schema";
import { renderFinding } from "@/lib/claims/findings";
import { attachFindings, attachInterpretation, toFindingInput } from "@/lib/claims/persist";
import { checkClaims, checkInterpretation, checkKeys, PROSE_RULES, type Issue } from "@/lib/claims/validate";
import { objectWithValidation } from "@/lib/llm";
import { loadRun, stageOutput, type StageCtx } from "../context";
import { StageInputError, type ParsedBrief } from "./brief";

const DirectionsSchema = z.object({
  directions: z.array(
    z.object({
      title: z.string().describe("Memorable, descriptive title, e.g. 'The kitchen between courses'"),
      audienceContext: z.string().describe("Who this reaches and in what moment, as a hedged interpretation"),
      productRole: z.string().describe("How the product earns its place in this world"),
      anchors: z.array(z.string()).describe("Evidence keys that define the direction: at least two concepts (tag evidence) and one cultural reference (entity evidence)"),
      interpretations: z
        .array(z.object({ text: z.string(), evidence: z.array(z.string()) }))
        .describe("2–4 readings of what the evidence suggests, each citing the keys it rests on"),
      sceneIdeas: z.array(z.string()),
      artDirection: z.object({ palette: z.string(), settings: z.array(z.string()), moodWords: z.array(z.string()) }),
      assumptions: z.array(z.string()).describe("What this direction takes for granted that the evidence does not establish"),
    }),
  ),
});
type Directions = z.infer<typeof DirectionsSchema>;

const SYSTEM = `You are a senior creative strategist. You group cultural evidence from Qloo's taste graph into distinct campaign directions a brand could test with creators.
Rules:
- Cite evidence only by its key (E1, E2, …). Never restate numbers, ranks or affinities; the product shows the findings themselves.
- Interpretations, audience context and product role are hedged readings ("could", "suggests"), without numbers, rankings or superlatives, and never predict purchasing, conversion or performance.
- Qloo describes aggregate affinities, not individuals.
- Directions must be genuinely different worlds, not variations of one idea.
${PROSE_RULES}`;

function tagShare(a: string[], b: string[]) {
  const sa = new Set(a);
  const overlap = b.filter((x) => sa.has(x)).length;
  return overlap / Math.max(1, Math.min(a.length, b.length));
}

export function validateDirections(v: Directions, pool: Map<string, { kind: string }>): Issue[] {
  const issues: Issue[] = [];
  const keys = new Set(pool.keys());
  if (v.directions.length < 3 || v.directions.length > 4) issues.push({ path: "directions", message: "return 3 or 4 directions" });
  v.directions.forEach((d, i) => {
    const p = `directions[${i}]`;
    issues.push(...checkKeys(d.anchors, keys, `${p}.anchors`, 3));
    const tags = d.anchors.filter((k) => pool.get(k)?.kind === "tag");
    const entities = d.anchors.filter((k) => pool.get(k)?.kind === "entity");
    if (tags.length < 2) issues.push({ path: `${p}.anchors`, message: "needs at least two concept (tag) anchors" });
    if (entities.length < 1) issues.push({ path: `${p}.anchors`, message: "needs at least one cultural reference (entity) anchor" });
    if (d.interpretations.length < 2 || d.interpretations.length > 4) issues.push({ path: `${p}.interpretations`, message: "give 2–4 interpretations" });
    d.interpretations.forEach((it, j) => {
      issues.push(...checkKeys(it.evidence, keys, `${p}.interpretations[${j}].evidence`));
      issues.push(...checkInterpretation(it.text, `${p}.interpretations[${j}].text`));
    });
    issues.push(...checkInterpretation(d.audienceContext, `${p}.audienceContext`));
    issues.push(...checkInterpretation(d.productRole, `${p}.productRole`));
    issues.push(...checkClaims(d.title, `${p}.title`));
    [...d.sceneIdeas, ...d.assumptions].forEach((t, j) => issues.push(...checkClaims(t, `${p}.copy[${j}]`)));
  });
  for (let a = 0; a < v.directions.length; a++) {
    for (let b = a + 1; b < v.directions.length; b++) {
      const ta = v.directions[a].anchors.filter((k) => pool.get(k)?.kind === "tag");
      const tb = v.directions[b].anchors.filter((k) => pool.get(k)?.kind === "tag");
      if (ta.length && tb.length && tagShare(ta, tb) > 0.5) {
        issues.push({ path: `directions[${a}],[${b}]`, message: "share most of their concept anchors; make them distinct worlds" });
      }
    }
  }
  return issues;
}

export async function synthesizeDirections(ctx: StageCtx) {
  const { brief, inputs, revision } = await loadRun(ctx.db, ctx.runId);
  const parsed = await stageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);

  // Idempotent: a retried step replaces this run's directions and their claims.
  await ctx.db.delete(claim).where(and(eq(claim.runId, ctx.runId), eq(claim.ownerType, "direction")));
  await ctx.db.delete(direction).where(eq(direction.runId, ctx.runId));

  const rows = await ctx.db.select().from(evidence).where(eq(evidence.runId, ctx.runId)).orderBy(asc(evidence.kind), asc(evidence.rank));
  const usable = rows.filter((r) => r.kind === "tag" || r.kind === "entity" || r.kind === "demographic");
  if (usable.filter((r) => r.kind === "tag").length < 4) {
    throw new StageInputError("Qloo returned too few concepts for these references to build directions. Add more specific references.");
  }
  const pool = new Map(usable.map((r, i) => [`E${i + 1}`, { kind: r.kind, id: r.id }]));
  const poolText = usable.map((r, i) => `E${i + 1} [${r.kind}] ${renderFinding(toFindingInput(r)).text}`).join("\n");

  const prompt = `<campaign>
Brand: ${brief.brandName}; product: ${brief.product.name} (${parsed.productCategory}) — ${brief.product.description}
Objective: ${parsed.objectiveSummary}
Markets: ${revision.markets.join(", ")}; type: ${revision.campaignType}
Audience inputs (with source): ${inputs.map((i) => `(${i.source}) ${i.text}`).join("; ") || "none"}
Intended audience: ${parsed.intendedAudience.summary}
</campaign>
<evidence>
${poolText}
</evidence>
Propose 3 or 4 distinct cultural directions for creator-made campaign content.`;

  const out = await objectWithValidation(
    ctx.llm,
    { name: "synthesize directions", system: SYSTEM, prompt, schema: DirectionsSchema, effort: "high" },
    (v) => validateDirections(v, pool),
  );

  const created: { id: string; title: string }[] = [];
  for (const [i, d] of out.directions.entries()) {
    const [row] = await ctx.db
      .insert(direction)
      .values({
        runId: ctx.runId,
        title: d.title,
        audienceContext: d.audienceContext,
        productRole: d.productRole,
        artDirection: { ...d.artDirection, sceneIdeas: d.sceneIdeas },
        assumptions: d.assumptions,
        colorIndex: i + 1,
      })
      .returning({ id: direction.id });
    const owner = { type: "direction" as const, id: row.id };
    const cited = [...new Set([...d.anchors, ...d.interpretations.flatMap((it) => it.evidence)])];
    const findingByEvidence = await attachFindings(ctx.db, ctx.runId, owner, cited.map((k) => pool.get(k)!.id));
    for (const it of d.interpretations) {
      const findingIds = it.evidence.map((k) => findingByEvidence.get(pool.get(k)!.id)!);
      await attachInterpretation(ctx.db, ctx.runId, owner, it.text, findingIds);
    }
    created.push({ id: row.id, title: d.title });
  }
  return { directions: created };
}
