// The durable research run (PLAN.md §3.2): one step per stage, a pause for disambiguation,
// automatic retries, recovery after crashes, and cancellation.

import { createHook } from "workflow";
import { executeStage, failRun } from "@/lib/pipeline/execute";
import { markStage, setRunStatus } from "@/lib/runs/stages";
import { stageName } from "@/lib/pipeline/stages";

export const resolveHookToken = (runId: string) => `research:${runId}:resolve`;

export async function researchRun(runId: string) {
  "use workflow";
  try {
    await stage(runId, 1);
    const resolved = (await stage(runId, 2)) as { needsInput: number };
    if (resolved.needsInput > 0) {
      await pauseForChoices(runId);
      const hook = createHook<{ resumed: true }>({ token: resolveHookToken(runId) });
      await hook;
      await resumeAfterChoices(runId);
    }
    for (const position of [3, 4, 5, 6, 7, 8, 9]) await stage(runId, position);
    await finish(runId);
    return { runId };
  } catch (err) {
    await fail(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function stage(runId: string, position: number) {
  "use step";
  return executeStage(runId, position);
}
stage.maxRetries = 3;

async function pauseForChoices(runId: string) {
  "use step";
  await setRunStatus(runId, "needs_input");
  await markStage(runId, 2, stageName(2), "needs_input");
}

async function resumeAfterChoices(runId: string) {
  "use step";
  await setRunStatus(runId, "running");
  await markStage(runId, 2, stageName(2), "done");
}

async function finish(runId: string) {
  "use step";
  await setRunStatus(runId, "done");
}

async function fail(runId: string, message: string) {
  "use step";
  await failRun(runId, message);
}
