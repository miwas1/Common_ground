// SPIKE (PLAN.md §8.3): proves the Workflow SDK runs durably on top of PGlite.
// Exercises: a step that writes stage rows, a step that fails once and is retried,
// a durable sleep, a long step (restart window), a pause for user input via a hook, and cancellation.
// Removed once the real pipeline workflow exists.

import { createHook, FatalError, getStepMetadata, sleep } from "workflow";
import { isCancelRequested, markStage, setRunStatus } from "@/lib/runs/stages";

export type SpikeChoice = { choice: string };

export const spikeHookToken = (runId: string) => `spike:${runId}:disambiguate`;

export async function spikeRun(runId: string, opts: { longStepMs: number; sleepMs: number }) {
  "use workflow";

  await quickStage(runId, 1, "resolve");
  await flakyStage(runId, 2, "audience");
  await sleep(opts.sleepMs);
  await longStage(runId, 3, "explore", opts.longStepMs);

  await pauseForInput(runId, 4, "disambiguate");
  const hook = createHook<SpikeChoice>({ token: spikeHookToken(runId) });
  const { choice } = await hook;

  await finishStage(runId, 4, "disambiguate", { choice });
  await completeRun(runId);
  return { runId, choice };
}

async function guard(runId: string) {
  if (await isCancelRequested(runId)) {
    await setRunStatus(runId, "cancelled");
    throw new FatalError("Run cancelled by user");
  }
}

async function quickStage(runId: string, position: number, name: string) {
  "use step";
  await guard(runId);
  await setRunStatus(runId, "running");
  await markStage(runId, position, name, "running");
  await markStage(runId, position, name, "done", { output: { attempt: getStepMetadata().attempt } });
}

async function flakyStage(runId: string, position: number, name: string) {
  "use step";
  await guard(runId);
  const { attempt } = getStepMetadata();
  await markStage(runId, position, name, "running", { output: { attempt } });
  if (attempt === 1) throw new Error("Simulated transient failure (Qloo 503)");
  await markStage(runId, position, name, "done", { output: { attempt } });
}

async function longStage(runId: string, position: number, name: string, ms: number) {
  "use step";
  await guard(runId);
  const { attempt } = getStepMetadata();
  await markStage(runId, position, name, "running", { output: { attempt } });
  await new Promise((resolve) => setTimeout(resolve, ms));
  await markStage(runId, position, name, "done", { output: { attempt } });
}

async function pauseForInput(runId: string, position: number, name: string) {
  "use step";
  await guard(runId);
  await setRunStatus(runId, "needs_input");
  await markStage(runId, position, name, "needs_input");
}

async function finishStage(runId: string, position: number, name: string, output: unknown) {
  "use step";
  await setRunStatus(runId, "running");
  await markStage(runId, position, name, "done", { output });
}

async function completeRun(runId: string) {
  "use step";
  await setRunStatus(runId, "done");
}
