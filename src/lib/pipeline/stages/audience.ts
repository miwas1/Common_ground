// Stage 3 — audience read: taste analysis across tag namespaces, plus a neutral comparison between
// the brand-associated demographic skew and the audience the brief intends to reach (PLAN.md §4.2).

import type { AgeBand } from "@/lib/qloo/types";
import { confirmedSignals, loadRun, signalLabels, stageOutput, type StageCtx } from "../context";
import { saveDemographicEvidence, saveTagEvidence } from "../evidence";
import { StageInputError, type ParsedBrief } from "./brief";

export const TASTE_NAMESPACES = [
  { type: "urn:tag:lifestyle:qloo", label: "lifestyle concepts" },
  { type: "urn:tag:aesthetic_property:qloo", label: "aesthetic qualities" },
  { type: "urn:tag:hobby:qloo", label: "hobbies" },
  { type: "urn:tag:emotional_tone:qloo", label: "emotional tones" },
] as const;

const MAX_SEED_ENTITIES = 5;

export type AudienceComparison = {
  intended: { ageBands: AgeBand[]; gender: "any" | "male" | "female"; summary: string };
  associated: { label: string; overIndexed: AgeBand[]; underIndexed: AgeBand[]; genderSkew: "male" | "female" | null }[];
  /** True when none of the intended age bands over-index for the brand-associated audience. */
  differs: boolean;
  /** Asked of the user when they differ; never treated as an error. */
  question: string | null;
};

export type AudienceOutput = { tagEvidence: number; demographicEvidence: number; comparison: AudienceComparison };

export async function audienceRead(ctx: StageCtx): Promise<AudienceOutput> {
  const { revision } = await loadRun(ctx.db, ctx.runId);
  const parsed = await stageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);
  const signals = await confirmedSignals(ctx.db, revision.id);
  const seeds = signals.entities.slice(0, MAX_SEED_ENTITIES);
  if (seeds.length + signals.tags.length === 0) {
    throw new StageInputError("None of the brief's references were found in Qloo. Add a public brand, artist, show or interest and run again.");
  }
  const profile = signalLabels({ entities: seeds, tags: signals.tags });

  const taste = await Promise.all(
    TASTE_NAMESPACES.map((ns) =>
      ctx.qloo.tasteProfile({ signals: { entities: seeds.map((s) => s.id), tags: signals.tags.map((t) => t.id) }, tagTypes: [ns.type], take: 12 }),
    ),
  );
  let tagEvidence = 0;
  for (const [i, res] of taste.entries()) {
    if (res.status === "error") throw new Error(`Qloo taste analysis failed: ${res.error.message}`);
    const saved = await saveTagEvidence(ctx.db, ctx.runId, res.data, { query: "taste", profile, resultLabel: TASTE_NAMESPACES[i].label }, res.call.id);
    tagEvidence += saved.length;
  }

  const demoSubjects = seeds.slice(0, 3);
  const labels = new Map(demoSubjects.map((s) => [s.id, s.label]));
  const demo = demoSubjects.length ? await ctx.qloo.demographics({ entities: demoSubjects.map((s) => s.id) }) : null;
  if (demo?.status === "error") throw new Error(`Qloo demographics failed: ${demo.error.message}`);
  const demoRows = demo?.data ?? [];
  const savedDemo = demo ? await saveDemographicEvidence(ctx.db, ctx.runId, demoRows, labels, demo.call.id) : [];

  const associated = demoRows.map((d) => {
    const bands = Object.entries(d.age) as [AgeBand, number][];
    const male = d.gender.male ?? 0;
    return {
      label: labels.get(d.subjectId) ?? d.subjectId,
      overIndexed: bands.filter(([, v]) => v >= 0.1).map(([b]) => b),
      underIndexed: bands.filter(([, v]) => v <= -0.1).map(([b]) => b),
      genderSkew: Math.abs(male) >= 0.05 ? (male > 0 ? ("male" as const) : ("female" as const)) : null,
    };
  });
  const intended = parsed.intendedAudience;
  const differs =
    intended.ageBands.length > 0 &&
    associated.length > 0 &&
    !associated.some((a) => a.overIndexed.some((b) => intended.ageBands.includes(b)));

  return {
    tagEvidence,
    demographicEvidence: savedDemo.length,
    comparison: {
      intended,
      associated,
      differs,
      question: differs
        ? "The audience Qloo associates with these references skews differently from the one in the brief. Is this campaign reaching a new segment?"
        : null,
    },
  };
}
