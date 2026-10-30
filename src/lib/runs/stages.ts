// Run and stage bookkeeping shared by every pipeline workflow.
// Writes are keyed by (run_id, position), so a retried step overwrites its own row: retries are idempotent.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { run, runStage } from "@/db/schema";

type StageStatus = (typeof runStage.$inferInsert)["status"];
type RunStatus = (typeof run.$inferInsert)["status"];

export async function markStage(
  runId: string,
  position: number,
  name: string,
  status: NonNullable<StageStatus>,
  details: { output?: unknown; error?: string } = {},
) {
  const db = await getDb();
  const now = new Date();
  const timing =
    status === "running"
      ? { startedAt: now, finishedAt: null }
      : status === "done" || status === "error" || status === "cancelled"
        ? { finishedAt: now }
        : {};
  await db
    .insert(runStage)
    .values({ runId, position, name, status, output: details.output, error: details.error, ...timing })
    .onConflictDoUpdate({
      target: [runStage.runId, runStage.position],
      set: { name, status, output: details.output ?? sql`${runStage.output}`, error: details.error ?? null, ...timing },
    });
}

export async function setRunStatus(runId: string, status: NonNullable<RunStatus>) {
  const db = await getDb();
  await db.update(run).set({ status }).where(eq(run.id, runId));
}

/** Steps call this before doing work; the UI sets the flag, the step stops the run. */
export async function isCancelRequested(runId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ cancelRequested: run.cancelRequested })
    .from(run)
    .where(and(eq(run.id, runId), eq(run.cancelRequested, true)))
    .limit(1);
  return rows.length > 0;
}
