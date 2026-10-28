import "server-only";

// Run lifecycle operations shared by server actions and development routes. Each checks authorization.

import { eq } from "drizzle-orm";
import { resumeHook } from "workflow/api";
import { getDb } from "@/db";
import { campaign, campaignRevision, run } from "@/db/schema";
import { requireAuthorized } from "@/lib/auth/actor";
import { startResearch } from "@/lib/pipeline/start";
import { applyResolutionChoices } from "@/lib/pipeline/stages/resolve";
import { resolveHookToken } from "@/workflows/research";

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
  if (remaining === 0 && r.status === "needs_input") await resumeHook(resolveHookToken(runId), { resumed: true });
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

