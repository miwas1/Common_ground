// Shared context for pipeline stages. Stages are plain async functions over this context, so they
// run inside durable workflow steps in the app and directly (with fakes) in tests.

import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { briefInput, campaign, campaignRevision, resolvedReference, run } from "@/db/schema";
import type { Llm } from "@/lib/llm";
import type { QlooApi } from "@/lib/qloo/api";

/** What the brand fills in (stored immutably on the revision). */
export type BriefForm = {
  brandName: string;
  product: { name: string; description: string };
  objective: string;
  /** Free text: customer research, references, anything the team knows. */
  notes: string;
  deliverables: string;
  constraints: string;
};

export type StageCtx = {
  db: Db;
  qloo: QlooApi;
  llm: Llm;
  runId: string;
};

export async function loadRun(db: Db, runId: string) {
  const [row] = await db
    .select({ run, revision: campaignRevision, campaign })
    .from(run)
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .innerJoin(campaign, eq(campaignRevision.campaignId, campaign.id))
    .where(eq(run.id, runId))
    .limit(1);
  if (!row) throw new Error(`Run ${runId} not found`);
  const inputs = await db.select().from(briefInput).where(eq(briefInput.revisionId, row.revision.id));
  return { ...row, brief: row.revision.brief as BriefForm, inputs };
}

export type LoadedRun = Awaited<ReturnType<typeof loadRun>>;

/** Confirmed Qloo references for the run's revision, split by kind. */
export async function confirmedSignals(db: Db, revisionId: string) {
  const rows = await db
    .select()
    .from(resolvedReference)
    .where(and(eq(resolvedReference.revisionId, revisionId), eq(resolvedReference.status, "confirmed")));
  const pick = (kind: "entity" | "tag" | "audience") =>
    rows.filter((r) => r.qlooKind === kind && r.qlooId).map((r) => ({ id: r.qlooId!, label: r.label, type: r.qlooType, briefInputId: r.briefInputId }));
  return { entities: pick("entity"), tags: pick("tag"), audiences: pick("audience") };
}

export type Signals = Awaited<ReturnType<typeof confirmedSignals>>;

/** Labels used in finding text to describe what a query was based on. */
export const signalLabels = (s: Pick<Signals, "entities" | "tags">) => [...s.entities.map((e) => e.label), ...s.tags.map((t) => t.label)];

/** Output of a previous stage, stored on its run_stage row. */
export async function stageOutput<T>(db: Db, runId: string, position: number): Promise<T> {
  const { runStage } = await import("@/db/schema");
  const [row] = await db
    .select({ output: runStage.output })
    .from(runStage)
    .where(and(eq(runStage.runId, runId), eq(runStage.position, position)))
    .limit(1);
  if (!row?.output) throw new Error(`Stage ${position} has no output for run ${runId}`);
  return row.output as T;
}
