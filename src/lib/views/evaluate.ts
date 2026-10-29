import "server-only";

// Read model for Evaluate (PLAN.md §4.6): the Qloo run and the baseline run of the same revision,
// shaped identically so the page can show them blind as Version A and Version B.
// Called after requireAuthorized(campaign.read).

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetPackage, campaign, run, runStage } from "@/db/schema";
import { stagesFor } from "@/lib/pipeline/stages";
import type { Capability } from "@/lib/pipeline/stages/cast";
import { getClaims, getProposals, getStrategy } from "./campaign";

async function latestRun(revisionId: string, mode: "qloo" | "baseline", status?: "done") {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(run)
    .where(and(eq(run.revisionId, revisionId), eq(run.mode, mode), ...(status ? [eq(run.status, status)] : [])))
    .orderBy(desc(run.createdAt))
    .limit(1);
  return r ?? null;
}

/** One version, in the shape both sides share. */
async function versionOf(runId: string, mode: "qloo" | "baseline") {
  const db = await getDb();
  const { directions } = await getStrategy(runId);
  const proposals = await getProposals(runId);
  const claims = await getClaims(proposals.map((p) => p.version.id));
  const packages = await db.select().from(budgetPackage).where(eq(budgetPackage.runId, runId));
  const all = [...directions.flatMap((d) => d.claims), ...[...claims.values()].flat()];
  return {
    mode,
    directions: directions.map((d) => ({
      id: d.direction.id,
      title: d.direction.title,
      audienceContext: d.direction.audienceContext,
      productRole: d.direction.productRole,
      artDirection: d.direction.artDirection as { palette?: string; moodWords?: string[]; sceneIdeas?: string[] },
      claims: d.claims,
      proposals: proposals
        .filter((p) => p.direction.id === d.direction.id)
        .map((p) => ({
          id: p.proposal.id,
          creatorId: p.creator.id,
          creator: `${p.creator.displayName}, ${p.creator.city}`,
          concept: p.version.concept as { title: string; logline: string; hook: string },
          hypothesis: p.version.hypothesis,
          terms: p.version.terms as { amountCents: number | null; currency: string; package: string },
          capability: ((p.fit?.capability as Capability | undefined)?.level ?? "not assessed") as Capability["level"],
          why: (claims.get(p.version.id) ?? []).filter((c) => c.kind === "interpretation"),
          allClaims: claims.get(p.version.id) ?? [],
        })),
    })),
    creatorIds: [...new Set(proposals.map((p) => p.creator.id))],
    packageCosts: packages.map((p) => p.costCents),
    qlooFindings: all.filter((c) => c.kind === "finding").length,
    briefCitations: all.filter((c) => c.kind === "interpretation" && c.basis.length > 0).length,
  };
}

export type EvaluationVersion = Awaited<ReturnType<typeof versionOf>>;

export async function getEvaluation(campaignId: string) {
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c?.currentRevisionId) return { state: "no_brief" as const };
  const research = await latestRun(c.currentRevisionId, "qloo", "done");
  if (!research) return { state: "no_research" as const };
  const baseline = await latestRun(c.currentRevisionId, "baseline");
  if (!baseline) return { state: "not_started" as const };
  if (baseline.status !== "done") {
    const stages = await db.select().from(runStage).where(eq(runStage.runId, baseline.id));
    return {
      state: "baseline_running" as const,
      status: baseline.status,
      stages: stagesFor("baseline").map((s) => {
        const row = stages.find((x) => x.position === s.position);
        return { name: s.name, status: row?.status ?? "pending", error: row?.error ?? null };
      }),
    };
  }

  const [withQloo, without] = await Promise.all([versionOf(research.id, "qloo"), versionOf(baseline.id, "baseline")]);
  // Which side is "A" depends on the baseline run's id: fixed for this comparison, not always the same side.
  const baselineFirst = parseInt(baseline.id.replaceAll("-", "").slice(-1), 16) % 2 === 0;
  const [a, b] = baselineFirst ? [without, withQloo] : [withQloo, without];
  const shared = a.creatorIds.filter((id) => b.creatorIds.includes(id));
  return { state: "ready" as const, a, b, sharedCreators: shared.length, creatorsInEither: new Set([...a.creatorIds, ...b.creatorIds]).size };
}

