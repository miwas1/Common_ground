// SPIKE (PLAN.md §8.3) — development only. Removed once the real pipeline exists.
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getRun, resumeHook, start } from "workflow/api";
import { getDb } from "@/db";
import { campaign, campaignRevision, run } from "@/db/schema";
import { getRunWithStages } from "@/lib/runs/stages";
import { spikeHookToken, spikeRun } from "@/workflows/spike";

const notInProduction = () =>
  process.env.NODE_ENV === "production" ? Response.json({ error: "not found" }, { status: 404 }) : undefined;

/** Start a spike run: POST {"longStepMs": 8000, "sleepMs": 6000} */
export async function POST(request: Request) {
  const blocked = notInProduction();
  if (blocked) return blocked;
  const body = (await request.json().catch(() => ({}))) as { longStepMs?: number; sleepMs?: number };

  const db = await getDb();
  const [c] = await db.insert(campaign).values({ name: "Spike", organizationId: "org_spike" }).returning();
  const [rev] = await db
    .insert(campaignRevision)
    .values({
      campaignId: c.id,
      number: 1,
      brief: {},
      campaignType: "ugc_production",
      markets: ["US"],
      languages: ["en"],
      createdBy: "spike",
    })
    .returning();
  const [r] = await db.insert(run).values({ revisionId: rev.id }).returning();

  const wf = await start(spikeRun, [r.id, { longStepMs: body.longStepMs ?? 8000, sleepMs: body.sleepMs ?? 6000 }]);
  await db.update(run).set({ workflowRunId: wf.runId }).where(eq(run.id, r.id));
  return Response.json({ runId: r.id, workflowRunId: wf.runId });
}

/** Inspect: GET ?id=<runId> → our run + stage rows, plus the workflow's own status. */
export async function GET(request: Request) {
  await connection();
  const blocked = notInProduction();
  if (blocked) return blocked;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const r = await getRunWithStages(id);
  if (!r) return Response.json({ error: "unknown run" }, { status: 404 });
  const workflowStatus = r.workflowRunId ? await getRun(r.workflowRunId).status : null;
  return Response.json({
    status: r.status,
    workflowStatus,
    stages: r.stages.map((s) => ({ position: s.position, name: s.name, status: s.status, output: s.output })),
  });
}

/** Resume the paused run: PATCH {"id": "<runId>", "choice": "..."} or cancel it: PATCH {"id", "cancel": true} */
export async function PATCH(request: Request) {
  const blocked = notInProduction();
  if (blocked) return blocked;
  const { id, choice, cancel } = (await request.json()) as { id: string; choice?: string; cancel?: boolean };
  if (cancel) {
    const db = await getDb();
    const [r] = await db.update(run).set({ cancelRequested: true }).where(eq(run.id, id)).returning();
    if (r?.workflowRunId) await getRun(r.workflowRunId).cancel({ cancelReason: "user cancelled" });
    await db.update(run).set({ status: "cancelled" }).where(eq(run.id, id));
    return Response.json({ cancelled: true });
  }
  const resumed = await resumeHook(spikeHookToken(id), { choice: choice ?? "Blue Bottle Coffee (brand)" });
  return Response.json({ resumed: true, workflowRunId: resumed.runId });
}
