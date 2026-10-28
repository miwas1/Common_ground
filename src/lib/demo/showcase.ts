// The showcase campaign (PLAN.md §6): the example brief, researched once with the real pipeline
// (real Qloo calls, real model) at deploy time, then read-only for everyone. It belongs to its own
// organization with no members, so nobody can change it; authorize() lets any signed-in user read it.
// Stages run inline here rather than as a durable workflow; the stage code and claim rules are the same.

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { organization } from "@/db/auth-schema";
import { briefInput, campaign, campaignRevision, orgProfile, resolvedReference, run } from "@/db/schema";
import { deriveRevision } from "@/lib/campaigns/revisions";
import type { Llm } from "@/lib/llm";
import type { BriefForm } from "@/lib/pipeline/context";
import { applyResolutionChoices } from "@/lib/pipeline/stages/resolve";
import { STAGES } from "@/lib/pipeline/stages";
import type { QlooApi } from "@/lib/qloo/api";
import type { Candidate } from "@/lib/qloo/resolve";
import { markStage, setRunStatus } from "@/lib/runs/stages";
import { EXAMPLE_BRIEF } from "./example-brief";

export const SHOWCASE_ORG = { name: "Common Ground showcase", slug: "showcase" };

/**
 * The answers a person would give at "Which did you mean?", keyed by a fragment of the reference label.
 * The brand is fictional, so it is left out. Anything not listed is left out too, and the campaign
 * page says so ("Left out at your choice").
 */
const SHOWCASE_CHOICES: { match: string; prefer: string[] }[] = [
  { match: "juniper", prefer: [] },
  { match: "iced coffee", prefer: ["Coffee Rituals", "Daily Coffee Rituals"] },
  { match: "dessert", prefer: ["Creative Dessert Making"] },
  { match: "hosting", prefer: ["Hosting", "Entertaining", "Dinner Parties"] },
  { match: "home cooking", prefer: ["Home Cooking", "Cooking"] },
];

export function showcaseChoice(label: string, candidates: Candidate[]): string | null {
  const exact = candidates.find((c) => c.name.toLowerCase() === label.toLowerCase());
  if (exact) return exact.id;
  const rule = SHOWCASE_CHOICES.find((r) => label.toLowerCase().includes(r.match));
  for (const name of rule?.prefer ?? []) {
    const c = candidates.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (c) return c.id;
  }
  return null;
}

export async function findShowcase(db: Db) {
  const [row] = await db
    .select({ id: campaign.id, currentRevisionId: campaign.currentRevisionId })
    .from(campaign)
    .where(eq(campaign.isShowcase, true))
    .orderBy(desc(campaign.createdAt))
    .limit(1);
  return row ?? null;
}

async function showcaseOrg(db: Db) {
  const [o] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, SHOWCASE_ORG.slug)).limit(1);
  const id = o?.id ?? randomUUID();
  if (!o) await db.insert(organization).values({ id, ...SHOWCASE_ORG, createdAt: new Date() });
  await db
    .insert(orgProfile)
    .values({ organizationId: id, kind: "brand", isDemo: true })
    .onConflictDoUpdate({ target: orgProfile.organizationId, set: { kind: "brand", isDemo: true } });
  return id;
}

async function showcaseRevision(db: Db) {
  const existing = await findShowcase(db);
  if (existing?.currentRevisionId) return { campaignId: existing.id, revisionId: existing.currentRevisionId };
  const organizationId = await showcaseOrg(db);
  const brief: BriefForm = {
    brandName: EXAMPLE_BRIEF.brandName,
    product: { name: EXAMPLE_BRIEF.productName, description: EXAMPLE_BRIEF.productDescription },
    objective: "Launch in the US and UK with original creator-made videos for paid social; learn which creative world to scale.",
    notes: EXAMPLE_BRIEF.notes,
    deliverables: EXAMPLE_BRIEF.deliverables,
    constraints: EXAMPLE_BRIEF.constraints,
  };
  const [c] = await db
    .insert(campaign)
    .values({ organizationId, name: "Cold brew concentrate launch", isShowcase: true })
    .returning({ id: campaign.id });
  const [rev] = await db
    .insert(campaignRevision)
    .values({ campaignId: c.id, number: 1, brief, campaignType: "ugc_production", markets: ["US", "GB"], languages: ["en"], budgetCents: 1_200_000, currency: "USD" })
    .returning({ id: campaignRevision.id });
  await db.insert(briefInput).values(EXAMPLE_BRIEF.audience.map((a) => ({ revisionId: rev.id, text: a.text, source: a.source })));
  await db.update(campaign).set({ currentRevisionId: rev.id }).where(eq(campaign.id, c.id));
  return { campaignId: c.id, revisionId: rev.id };
}

export type ShowcaseDeps = { qlooFor: (campaignId: string, runId: string) => QlooApi; llm: Llm; log?: (line: string) => void };

/** The refinement shown in the showcase's revision compare: the same brief without this reference. */
export const SHOWCASE_REMOVED_REFERENCE = "Khruangbin";

/** Run every stage of a new run for the revision, inline; choices at "Which did you mean?" come from SHOWCASE_CHOICES. */
async function researchInline(db: Db, deps: ShowcaseDeps, campaignId: string, revisionId: string) {
  const log = deps.log ?? (() => undefined);
  const [done] = await db.select({ id: run.id }).from(run).where(and(eq(run.revisionId, revisionId), eq(run.status, "done"))).limit(1);
  if (done) return false;

  // A previous attempt that died mid-run would block a new one (one active run per revision).
  // Its reference resolution belongs to the revision and is reused.
  await db.update(run).set({ status: "error" }).where(and(eq(run.revisionId, revisionId), eq(run.status, "running")));
  const [r] = await db.insert(run).values({ revisionId, status: "running" }).returning({ id: run.id });
  const ctx = { db, runId: r.id, qloo: deps.qlooFor(campaignId, r.id), llm: deps.llm };
  try {
    for (const stage of STAGES) {
      const started = Date.now();
      await markStage(r.id, stage.position, stage.name, "running");
      const output = await stage.run(ctx);
      if (stage.position === 2) {
        const refs = await db.select().from(resolvedReference).where(and(eq(resolvedReference.revisionId, revisionId), eq(resolvedReference.status, "needs_input")));
        const choices = refs.map((ref) => ({ referenceId: ref.id, candidateId: showcaseChoice(ref.label, ref.candidates as Candidate[]) }));
        await applyResolutionChoices(db, revisionId, choices);
        for (const ref of refs) log(`  "${ref.label}" → ${choices.find((c) => c.referenceId === ref.id)?.candidateId ?? "left out"}`);
      }
      await markStage(r.id, stage.position, stage.name, "done", { output });
      log(`  ${stage.name} (${Math.round((Date.now() - started) / 1000)}s)`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setRunStatus(r.id, "error");
    throw new Error(`Showcase research failed: ${message}`);
  }
  await setRunStatus(r.id, "done");
  return true;
}

/**
 * Idempotent: researches revision 1 (the example brief), then revision 2 (the same brief with
 * SHOWCASE_REMOVED_REFERENCE removed) for the revision compare. Each step is skipped once done.
 * The campaign keeps revision 1 as its current revision.
 */
export async function seedShowcase(db: Db, deps: ShowcaseDeps): Promise<{ campaignId: string; status: "exists" | "created" }> {
  const log = deps.log ?? (() => undefined);
  const { campaignId, revisionId } = await showcaseRevision(db);
  let created = await researchInline(db, deps, campaignId, revisionId);
  await db.update(campaign).set({ status: "reviewing_proposals", currentRevisionId: revisionId }).where(eq(campaign.id, campaignId));

  const [child] = await db.select({ id: campaignRevision.id }).from(campaignRevision).where(eq(campaignRevision.parentRevisionId, revisionId)).limit(1);
  let childId = child?.id;
  if (!childId) {
    const [ref] = await db
      .select({ id: resolvedReference.id })
      .from(resolvedReference)
      .where(and(eq(resolvedReference.revisionId, revisionId), eq(resolvedReference.status, "confirmed"), eq(resolvedReference.label, SHOWCASE_REMOVED_REFERENCE)));
    if (!ref) {
      log(`  revision 2 skipped: "${SHOWCASE_REMOVED_REFERENCE}" is not a confirmed reference`);
      return { campaignId, status: created ? "created" : "exists" };
    }
    childId = (await deriveRevision(db, campaignId, { type: "remove_reference", referenceId: ref.id }, null)).revisionId;
    log(`  revision 2: removed "${SHOWCASE_REMOVED_REFERENCE}"`);
  }
  created = (await researchInline(db, deps, campaignId, childId)) || created;
  return { campaignId, status: created ? "created" : "exists" };
}
