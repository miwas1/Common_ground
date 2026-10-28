import "server-only";

import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb } from "@/db";
import { campaign, run } from "@/db/schema";
import { researchRun } from "@/workflows/research";

/** Create a run for a revision and start its durable workflow. One active run per revision (DB-enforced). */
export async function startResearch(revisionId: string, campaignId: string) {
  const db = await getDb();
  const [r] = await db.insert(run).values({ revisionId, status: "pending" }).returning({ id: run.id });
  const wf = await start(researchRun, [r.id]);
  await db.update(run).set({ workflowRunId: wf.runId }).where(eq(run.id, r.id));
  await db.update(campaign).set({ status: "researching", currentRevisionId: revisionId }).where(eq(campaign.id, campaignId));
  return r.id;
}
