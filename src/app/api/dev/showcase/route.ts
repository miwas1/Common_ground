// Development only: bring the showcase up to date inside the running server, which owns the local
// database (PGlite allows one process). Same code as `pnpm db:showcase`. 404 in production.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignRevision, orgProfile, run, runStage } from "@/db/schema";
import { ensureExampleProfile } from "@/lib/demo/example-research";
import { seedShowcase } from "@/lib/demo/showcase";
import { DISCOVERY_METHOD } from "@/lib/pipeline/stages/discover";
import { anthropicLlm } from "@/lib/llm";
import { qlooFor } from "@/lib/qloo/server";

export async function POST() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not found" }, { status: 404 });
  const db = await getDb();
  const lines: string[] = [];
  // The demo brand gets the example profile too (production does this in `pnpm db:seed`).
  for (const o of await db.select({ id: orgProfile.organizationId }).from(orgProfile).where(and(eq(orgProfile.isDemo, true), eq(orgProfile.kind, "brand")))) {
    if (await ensureExampleProfile(db, o.id)) lines.push(`  example brand profile added to ${o.id}`);
  }
  const res = await seedShowcase(db, { qlooFor: (c, r) => qlooFor(c, r), llm: anthropicLlm(), log: (l) => lines.push(l) });
  const discovery = await db
    .select({ runId: run.id, revision: campaignRevision.number, output: runStage.output })
    .from(runStage)
    .innerJoin(run, eq(runStage.runId, run.id))
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .where(and(eq(campaignRevision.campaignId, res.campaignId), eq(runStage.position, 10)));
  return Response.json({ ...res, log: lines, discovery: discovery.map((d) => ({ revision: d.revision, output: d.output })), method: DISCOVERY_METHOD });
}
