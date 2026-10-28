// Runs one pipeline stage for a run, recording progress on its run_stage row.
// Called from durable workflow steps (src/workflows/research.ts). Failures that a retry cannot fix
// stop the run immediately (FatalError); others are rethrown so the step is retried.

import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { getDb } from "@/db";
import { campaign as campaignTable } from "@/db/schema";
import { anthropicLlm, LlmRefusalError, LlmValidationError } from "@/lib/llm";
import { isCancelRequested, markStage, setRunStatus } from "@/lib/runs/stages";
import { qlooFor } from "@/lib/qloo/server";
import { loadRun } from "./context";
import { StageInputError } from "./stages/brief";
import { STAGES } from "./stages";

export async function executeStage(runId: string, position: number) {
  const stage = STAGES.find((s) => s.position === position);
  if (!stage) throw new FatalError(`Unknown stage ${position}`);
  const db = await getDb();
  if (await isCancelRequested(runId)) {
    await setRunStatus(runId, "cancelled");
    throw new FatalError("Run cancelled");
  }
  const { campaign } = await loadRun(db, runId);
  await setRunStatus(runId, "running");
  await markStage(runId, position, stage.name, "running");
  try {
    const output = await stage.run({ db, runId, qloo: qlooFor(campaign.id, runId), llm: anthropicLlm() });
    await markStage(runId, position, stage.name, "done", { output });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markStage(runId, position, stage.name, "error", { error: message });
    if (err instanceof StageInputError || err instanceof LlmRefusalError || err instanceof LlmValidationError) {
      throw new FatalError(message);
    }
    throw err;
  }
}

/** A finished run: its campaign moves on to reviewing proposals. */
export async function completeRun(runId: string) {
  const db = await getDb();
  await setRunStatus(runId, "done");
  const { campaign } = await loadRun(db, runId);
  await db.update(campaignTable).set({ status: "reviewing_proposals" }).where(eq(campaignTable.id, campaign.id));
}

export async function failRun(runId: string, message: string) {
  await setRunStatus(runId, "error");
  // Leave a visible reason on the stage that was running, if it could not record one itself.
  const { runStage } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const db = await getDb();
  await db.update(runStage).set({ status: "error", error: message }).where(and(eq(runStage.runId, runId), eq(runStage.status, "running")));
}
