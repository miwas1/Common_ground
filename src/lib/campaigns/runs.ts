import "server-only";

// Run lifecycle operations shared by server actions and development routes. Each checks authorization.

import { and, desc, eq } from "drizzle-orm";
import { resumeHook } from "workflow/api";
import { HookNotFoundError } from "workflow/errors";
import { getDb } from "@/db";
import { campaign, campaignRevision, run } from "@/db/schema";
import { requireAuthorized } from "@/lib/auth/actor";
import { startBaseline, startResearch } from "@/lib/pipeline/start";
import { stageName } from "@/lib/pipeline/stages";
import { applyResolutionChoices } from "@/lib/pipeline/stages/resolve";
import { markStage, setRunStatus } from "@/lib/runs/stages";
import { resolveHookToken } from "@/workflows/research";
import { deriveRevision, type RevisionChange } from "./revisions";

export async function runCampaign(runId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ run, campaignId: campaignRevision.campaignId })
    .from(run)
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .where(eq(run.id, runId));
  if (!row) throw new Error("Run not found");
  return row;
}

/** Shared by the form action and the development API: authorize, apply choices, resume when complete. */
export async function resolveAndResume(runId: string, choices: { referenceId: string; candidateId: string | null }[]) {
  const { run: r, campaignId } = await runCampaign(runId);
  await requireAuthorized({ type: "campaign.write", campaignId });
  const { remaining } = await applyResolutionChoices(await getDb(), r.revisionId, choices);
  if (remaining === 0 && r.status === "needs_input") {
    try {
      await resumeHook(resolveHookToken(runId), { resumed: true });
    } catch (err) {
      if (!HookNotFoundError.is(err)) throw err;
      // The paused workflow is gone (e.g. its run ended). The choices are saved on the revision,
      // so a new run reuses them: stop this one and let the user run the research again.
      await setRunStatus(runId, "error");
      await markStage(runId, 2, stageName(2), "error", { error: "The research was interrupted. Your choices are saved, so just try again." });
    }
  }
  return { campaignId, remaining };
}

/** Start a fresh run on the campaign's current revision (after a failure or cancellation). */
export async function retryResearch(campaignId: string) {
  await requireAuthorized({ type: "campaign.write", campaignId });
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c?.currentRevisionId) throw new Error("This campaign has no brief yet");
  await startResearch(c.currentRevisionId, campaignId);
  return campaignId;
}


/** A refinement: a new immutable revision of the campaign, researched from the start. */
export async function refineCampaign(campaignId: string, change: RevisionChange) {
  const { userId } = await requireAuthorized({ type: "campaign.write", campaignId });
  const db = await getDb();
  const { revisionId } = await deriveRevision(db, campaignId, change, userId);
  await startResearch(revisionId, campaignId);
  return revisionId;
}

/** A reason the comparison cannot start that the user can act on. */
export class EvaluationError extends Error {}

/** Evaluate: run the current revision again without Qloo, once its Qloo research has finished. */
export async function startEvaluation(campaignId: string) {
  await requireAuthorized({ type: "campaign.write", campaignId });
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c?.currentRevisionId) throw new EvaluationError("This campaign has no brief yet.");
  const latest = (mode: "qloo" | "baseline") =>
    db.select().from(run).where(and(eq(run.revisionId, c.currentRevisionId!), eq(run.mode, mode))).orderBy(desc(run.createdAt)).limit(1);
  const [[research], [baseline]] = await Promise.all([latest("qloo"), latest("baseline")]);
  if (research?.status !== "done") throw new EvaluationError("Wait for the research to finish first.");
  if (baseline && ["pending", "running", "needs_input"].includes(baseline.status)) throw new EvaluationError("The comparison is already running.");
  return startBaseline(c.currentRevisionId);
}
