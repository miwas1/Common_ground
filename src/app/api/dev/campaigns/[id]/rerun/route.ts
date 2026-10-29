// Development only: re-run chosen stages of a campaign's latest run, in order, with the same
// step function the workflow uses (e.g. ?stages=10,7,8,9 after changing creator discovery). 404 in production.
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignRevision, run } from "@/db/schema";
import { executeStage } from "@/lib/pipeline/execute";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not found" }, { status: 404 });
  const { id } = await params;
  const stages = (new URL(request.url).searchParams.get("stages") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n));
  const db = await getDb();
  const [r] = await db
    .select({ id: run.id })
    .from(run)
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .where(and(eq(campaignRevision.campaignId, id), eq(run.mode, "qloo")))
    .orderBy(desc(run.createdAt))
    .limit(1);
  if (!r) return Response.json({ error: "no run" }, { status: 404 });
  const outputs: Record<number, unknown> = {};
  for (const position of stages) outputs[position] = await executeStage(r.id, position);
  // executeStage marks the run as running while it works; the stages it needs had already finished.
  await db.update(run).set({ status: "done" }).where(eq(run.id, r.id));
  return Response.json({ runId: r.id, outputs });
}
