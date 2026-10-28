// Stage 6 — three separate checks per direction (PLAN.md §4.2):
//   coherence   — do the direction's references relate to each other?
//   sensitivity — does it change when a brief input is removed? (leave-one-out, rank-biased overlap)
//   relevance   — does it fit the intended audience? Scored against a profile built only from the
//                 audience inputs (not used to generate the direction), plus a labelled model judgment.

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { briefInput, claim, claimBinding, directionCheck, evidence } from "@/db/schema";
import { renderFinding } from "@/lib/claims/findings";
import { attachFindings, attachInterpretation, toFindingInput } from "@/lib/claims/persist";
import { checkInterpretation, checkKeys, PROSE_RULES, type Issue } from "@/lib/claims/validate";
import { objectWithValidation } from "@/lib/llm";
import type { QlooTag } from "@/lib/qloo/types";
import { confirmedSignals, loadRun, stageOutput, type StageCtx } from "../context";
import { saveTagEvidence } from "../evidence";
import { directionProfiles, type DirectionProfile } from "../profiles";
import { rbo } from "../rbo";
import type { ParsedBrief } from "./brief";

/** A direction is stable under an input's removal when most of its concepts are still returned
 *  and their order largely holds. Both numbers are shown to the user. */
export const STABLE_OVERLAP = 0.6;
export const STABLE_RETAINED = 0.75;
const MAX_TESTED_INPUTS = 6;

type Affinities = Map<string, number>;
const toMap = (tags: QlooTag[]): Affinities => new Map(tags.filter((t) => t.affinity !== undefined).map((t) => [t.id, t.affinity!]));

/** Affinities that barely vary (spread under 0.02) cannot rank anything. */
export function isFlat(tags: QlooTag[]) {
  const values = tags.map((t) => t.affinity).filter((a): a is number => a !== undefined);
  return values.length < 2 || Math.max(...values) - Math.min(...values) < 0.02;
}

/** The direction's anchor tags ordered by affinity under a given profile (missing = dropped out). */
function ranking(p: DirectionProfile, scores: Affinities) {
  return p.tags
    .map((t) => t.qlooId)
    .filter((id) => scores.has(id))
    .sort((a, b) => scores.get(b)! - scores.get(a)!);
}

export function sensitivityFor(p: DirectionProfile, base: Affinities, without: { label: string; source: string | null; scores: Affinities }[]) {
  const baseRank = ranking(p, base);
  const tested = without.map((w) => {
    const after = ranking(p, w.scores);
    const overlap = baseRank.length ? rbo(baseRank, after) : 0;
    const retained = baseRank.length ? after.filter((id) => baseRank.includes(id)).length / baseRank.length : 0;
    return {
      input: w.label,
      source: w.source,
      overlap: Math.round(overlap * 100) / 100,
      retained: Math.round(retained * 100) / 100,
      stable: overlap >= STABLE_OVERLAP && retained >= STABLE_RETAINED,
    };
  });
  const changesWhen = tested.filter((t) => !t.stable);
  return {
    measured: tested.length > 0,
    tested,
    summary: tested.length === 0 ? "Not tested: the brief has fewer than two resolved inputs." : changesWhen.length === 0 ? `Stable when each of ${tested.length} inputs is removed` : `Changes when ${changesWhen.map((t) => t.input).join(", ")} ${changesWhen.length === 1 ? "is" : "are"} removed`,
    dependsOnAssumption: changesWhen.some((t) => t.source === "assumption"),
  };
}

const RelevanceSchema = z.object({
  judgments: z.array(
    z.object({
      direction: z.string().describe("Direction key, e.g. D1"),
      fit: z.enum(["aligned", "partial", "unclear"]),
      interpretation: z.string(),
      evidence: z.array(z.string()).describe("Relevance finding keys (R…) the judgment rests on"),
    }),
  ),
});

/** Idempotent retry: remove only what this stage creates (checks, relevance evidence and its claims). */
async function resetChecks(ctx: StageCtx, directionIds: string[]) {
  if (directionIds.length) await ctx.db.delete(directionCheck).where(inArray(directionCheck.directionId, directionIds));
  const scoreEvidence = await ctx.db
    .select({ id: evidence.id })
    .from(evidence)
    .where(and(eq(evidence.runId, ctx.runId), sql`${evidence.values}->'context'->>'query' = 'score'`));
  if (scoreEvidence.length === 0) return;
  const findings = await ctx.db
    .select({ id: claimBinding.claimId })
    .from(claimBinding)
    .where(inArray(claimBinding.evidenceId, scoreEvidence.map((e) => e.id)));
  const findingIds = findings.map((f) => f.id);
  if (findingIds.length) {
    const interpretations = await ctx.db
      .select({ id: claimBinding.claimId })
      .from(claimBinding)
      .where(inArray(claimBinding.findingClaimId, findingIds));
    await ctx.db.delete(claim).where(inArray(claim.id, [...findingIds, ...interpretations.map((i) => i.id)]));
  }
  await ctx.db.delete(evidence).where(inArray(evidence.id, scoreEvidence.map((e) => e.id)));
}

export async function checkDirections(ctx: StageCtx) {
  const { revision, brief } = await loadRun(ctx.db, ctx.runId);
  const parsed = await stageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);
  const profiles = await directionProfiles(ctx.db, ctx.runId);
  const signals = await confirmedSignals(ctx.db, revision.id);
  const allAnchorTags = [...new Set(profiles.flatMap((p) => p.tags.map((t) => t.qlooId)))];

  await resetChecks(ctx, profiles.map((p) => p.direction.id));

  // ── Coherence ────────────────────────────────────────────────────────────
  const coherence = await Promise.all(
    profiles.map(async (p) => {
      if (p.entities.length === 0 || p.tags.length === 0) return { measured: false, summary: "Not measured: needs both references and concepts." };
      const res = await ctx.qloo.tasteProfile({ signals: { entities: p.entities.slice(0, 5).map((e) => e.qlooId) }, scoreTags: p.tags.map((t) => t.qlooId) });
      if (res.status === "error") return { measured: false, summary: `Not measured: ${res.error.message}` };
      const scores = toMap(res.data);
      const share = scores.size / p.tags.length;
      const mean = scores.size ? [...scores.values()].reduce((a, b) => a + b, 0) / scores.size : 0;
      const related = share >= 0.75 && mean >= 0.6;
      return {
        measured: true,
        share: Math.round(share * 100) / 100,
        meanAffinity: Math.round(mean * 100) / 100,
        summary: related ? "The direction's references and concepts are related" : "The direction's references and concepts are only loosely related",
      };
    }),
  );

  // ── Input sensitivity (leave-one-out) ────────────────────────────────────
  const sources = new Map(
    (await ctx.db.select().from(briefInput).where(eq(briefInput.revisionId, revision.id))).map((i) => [i.id, i.source as string]),
  );
  const inputs = [
    ...signals.entities.slice(0, 5).map((e) => ({ kind: "entity" as const, ...e })),
    ...signals.tags.map((t) => ({ kind: "tag" as const, ...t })),
  ].slice(0, MAX_TESTED_INPUTS);
  const profileFor = (skip?: string) => ({
    entities: inputs.filter((i) => i.kind === "entity" && i.id !== skip).map((i) => i.id),
    tags: inputs.filter((i) => i.kind === "tag" && i.id !== skip).map((i) => i.id),
  });
  let base: Affinities = new Map();
  const without: { label: string; source: string | null; scores: Affinities }[] = [];
  if (inputs.length >= 2 && allAnchorTags.length) {
    const baseRes = await ctx.qloo.tasteProfile({ signals: profileFor(), scoreTags: allAnchorTags });
    if (baseRes.status === "error") throw new Error(`Qloo sensitivity baseline failed: ${baseRes.error.message}`);
    base = toMap(baseRes.data);
    const loo = await Promise.all(inputs.map((i) => ctx.qloo.tasteProfile({ signals: profileFor(i.id), scoreTags: allAnchorTags })));
    loo.forEach((res, k) => {
      if (res.status === "error") return;
      without.push({ label: inputs[k].label, source: inputs[k].briefInputId ? (sources.get(inputs[k].briefInputId!) ?? null) : "team", scores: toMap(res.data) });
    });
  }

  // ── Relevance (held-out audience profile) ────────────────────────────────
  const audienceSignals = {
    audiences: signals.audiences.map((a) => a.id),
    ageBands: parsed.intendedAudience.ageBands,
    gender: parsed.intendedAudience.gender === "any" ? undefined : parsed.intendedAudience.gender,
  };
  const audienceLabels = [
    ...signals.audiences.map((a) => a.label),
    ...(parsed.intendedAudience.ageBands.length ? [`ages ${parsed.intendedAudience.ageBands.join(", ").replaceAll("_", " ")}`] : []),
    ...(audienceSignals.gender ? [audienceSignals.gender] : []),
  ];
  const hasAudience = audienceSignals.audiences.length > 0 || audienceSignals.ageBands.length > 0 || Boolean(audienceSignals.gender);
  const relevanceRes = hasAudience && allAnchorTags.length ? await ctx.qloo.tasteProfile({ signals: audienceSignals, scoreTags: allAnchorTags }) : null;
  // A profile that scores every concept the same carries no information; ranks among ties are arbitrary.
  const relevanceFlat = relevanceRes !== null && relevanceRes.status !== "error" && isFlat(relevanceRes.data);
  const relevanceMeasured = relevanceRes !== null && relevanceRes.status !== "error" && !relevanceFlat;
  const relEvidence = relevanceMeasured
    ? await saveTagEvidence(ctx.db, ctx.runId, relevanceRes.data, { query: "score", profile: audienceLabels, resultLabel: "direction concepts" }, relevanceRes.call.id)
    : [];
  const relByTag = new Map(relEvidence.map((e) => [e.qlooRef!, e.id]));

  const relKeys = new Map<string, string>(); // R-key → evidenceId
  const perDirectionKeys = profiles.map((p) => {
    const keys: string[] = [];
    for (const t of p.tags) {
      const ev = relByTag.get(t.qlooId);
      if (!ev) continue;
      const key = `R${relKeys.size + 1}`;
      relKeys.set(key, ev);
      keys.push(key);
    }
    return keys;
  });

  let judgments: z.infer<typeof RelevanceSchema>["judgments"] = [];
  if (relevanceMeasured && relKeys.size > 0) {
    const evRows = await ctx.db.select().from(evidence).where(inArray(evidence.id, [...relKeys.values()]));
    const evById = new Map(evRows.map((r) => [r.id, r]));
    const lines = profiles
      .map((p, i) => {
        const findings = perDirectionKeys[i].map((k) => `  ${k}: ${renderFinding(toFindingInput(evById.get(relKeys.get(k)!)!)).text}`).join("\n") || "  (none of its concepts were returned for this audience)";
        return `D${i + 1} "${p.direction.title}" — ${p.direction.audienceContext}\n${findings}`;
      })
      .join("\n");
    const out = await objectWithValidation(
      ctx.llm,
      {
        name: "judge relevance",
        system: `You judge whether campaign directions fit a brand's objective and intended audience. Cite only the relevance findings provided (R keys).\n${PROSE_RULES}`,
        prompt: `Objective: ${parsed.objectiveSummary}\nProduct: ${brief.product.name} (${parsed.productCategory})\nIntended audience: ${parsed.intendedAudience.summary}\nThe findings below score each direction's concepts against a profile built only from the intended-audience inputs.\n<directions>\n${lines}\n</directions>\nJudge every direction that has findings.`,
        schema: RelevanceSchema,
        effort: "medium",
      },
      (v) => {
        const issues: Issue[] = [];
        v.judgments.forEach((j, i) => {
          const idx = Number(j.direction.replace(/\D/g, "")) - 1;
          if (!(idx >= 0 && idx < profiles.length)) issues.push({ path: `judgments[${i}].direction`, message: "unknown direction key" });
          else issues.push(...checkKeys(j.evidence, new Set(perDirectionKeys[idx]), `judgments[${i}].evidence`));
          issues.push(...checkInterpretation(j.interpretation, `judgments[${i}].interpretation`));
        });
        return issues;
      },
    );
    judgments = out.judgments;
  }

  // ── Persist ──────────────────────────────────────────────────────────────
  for (const [i, p] of profiles.entries()) {
    const owner = { type: "direction" as const, id: p.direction.id };
    const relevantKeys = perDirectionKeys[i];
    const judgment = judgments.find((j) => Number(j.direction.replace(/\D/g, "")) - 1 === i);
    let interpretationId: string | null = null;
    if (judgment) {
      const findings = await attachFindings(ctx.db, ctx.runId, owner, judgment.evidence.map((k) => relKeys.get(k)!));
      interpretationId = await attachInterpretation(ctx.db, ctx.runId, owner, judgment.interpretation, [...findings.values()]);
    }
    const sensitivity = sensitivityFor(p, base, without);
    await ctx.db.insert(directionCheck).values([
      { directionId: p.direction.id, kind: "coherence", result: coherence[i], testedInputs: p.tags.map((t) => t.label) },
      { directionId: p.direction.id, kind: "sensitivity", result: sensitivity, testedInputs: sensitivity.tested.map((t) => t.input) },
      {
        directionId: p.direction.id,
        kind: "relevance",
        result: relevanceMeasured
          ? {
              measured: true,
              returned: relevantKeys.length,
              of: p.tags.length,
              fit: judgment?.fit ?? "unclear",
              interpretationClaimId: interpretationId,
              summary: `${relevantKeys.length} of ${p.tags.length} concepts were returned for the intended-audience profile`,
            }
          : {
              measured: false,
              summary: relevanceFlat
                ? "Not measured: Qloo gave every concept the same affinity for the intended-audience profile, so it cannot distinguish them. Add an audience segment to the brief to measure this."
                : hasAudience
                  ? "Not measured: Qloo could not score this audience profile."
                  : "Not measured: the brief names no audience segment, age range or gender.",
            },
        testedInputs: audienceLabels,
      },
    ]);
  }
  return {
    directions: profiles.map((p, i) => ({
      id: p.direction.id,
      coherence: coherence[i].summary,
      sensitivity: sensitivityFor(p, base, without).summary,
      relevance: relevanceMeasured ? (judgments.find((j) => Number(j.direction.replace(/\D/g, "")) - 1 === i)?.fit ?? "unclear") : "not measured",
    })),
  };
}
