import "server-only";

// Read models for refinement and the revision compare view. Called after requireAuthorized(campaign.read).

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  briefInput,
  budgetPackage,
  campaign,
  campaignRevision,
  claim,
  claimBinding,
  creator,
  creatorFit,
  direction,
  evidence,
  proposal,
  resolvedReference,
  run,
} from "@/db/schema";
import { diffNames, matchDirections } from "@/lib/campaigns/compare";

export async function listRevisions(campaignId: string) {
  const db = await getDb();
  const revs = await db.select().from(campaignRevision).where(eq(campaignRevision.campaignId, campaignId)).orderBy(desc(campaignRevision.number));
  const runs = revs.length ? await db.select().from(run).where(inArray(run.revisionId, revs.map((r) => r.id))).orderBy(desc(run.createdAt)) : [];
  return revs.map((r) => ({ revision: r, run: runs.find((x) => x.revisionId === r.id) ?? null }));
}

/** What the refine panel offers to remove: the current revision's confirmed references and audience inputs. */
export async function getRefinable(revisionId: string) {
  const db = await getDb();
  const refs = await db
    .select()
    .from(resolvedReference)
    .where(and(eq(resolvedReference.revisionId, revisionId), eq(resolvedReference.status, "confirmed")));
  const inputs = await db.select().from(briefInput).where(eq(briefInput.revisionId, revisionId));
  return { references: refs, inputs };
}

async function revisionSummary(revisionId: string) {
  const db = await getDb();
  const [rev] = await db.select().from(campaignRevision).where(eq(campaignRevision.id, revisionId));
  const [r] = await db
    .select()
    .from(run)
    .where(and(eq(run.revisionId, revisionId), eq(run.status, "done")))
    .orderBy(desc(run.createdAt))
    .limit(1);
  const refs = await db
    .select({ label: resolvedReference.label })
    .from(resolvedReference)
    .where(and(eq(resolvedReference.revisionId, revisionId), eq(resolvedReference.status, "confirmed")));
  const inputs = await db.select({ text: briefInput.text }).from(briefInput).where(eq(briefInput.revisionId, revisionId));
  const base = { revision: rev, done: Boolean(r), references: refs.map((x) => x.label), inputs: inputs.map((x) => x.text) };
  if (!r) return { ...base, directions: [], packages: [], proposals: 0 };

  const dirs = await db.select().from(direction).where(eq(direction.runId, r.id)).orderBy(direction.colorIndex);
  const anchorRows = dirs.length
    ? await db
        .select({ directionId: claim.ownerId, ref: evidence.qlooRef, label: evidence.label })
        .from(claim)
        .innerJoin(claimBinding, eq(claimBinding.claimId, claim.id))
        .innerJoin(evidence, eq(evidence.id, claimBinding.evidenceId))
        .where(and(eq(claim.ownerType, "direction"), eq(claim.kind, "finding"), inArray(claim.ownerId, dirs.map((d) => d.id))))
    : [];
  const fits = await db
    .select({ directionId: creatorFit.directionId, name: creator.displayName })
    .from(creatorFit)
    .innerJoin(creator, eq(creator.id, creatorFit.creatorId))
    .where(and(eq(creatorFit.runId, r.id), eq(creatorFit.shortlisted, true)));
  const packages = await db.select({ kind: budgetPackage.kind, costCents: budgetPackage.costCents }).from(budgetPackage).where(eq(budgetPackage.runId, r.id));
  const proposals = await db.$count(proposal, eq(proposal.runId, r.id));

  return {
    ...base,
    directions: dirs.map((d) => {
      const anchors = anchorRows.filter((a) => a.directionId === d.id);
      return {
        id: d.id,
        title: d.title,
        colorIndex: d.colorIndex,
        anchors: new Map(anchors.map((a) => [a.ref ?? a.label, a.label])),
        creators: [...new Set(fits.filter((f) => f.directionId === d.id).map((f) => f.name))],
      };
    }),
    packages,
    proposals,
  };
}

export type RevisionSummary = Awaited<ReturnType<typeof revisionSummary>>;

/** Compare a revision with its parent: by default the current revision, or the newest one that has a parent. */
export async function compareRevisions(campaignId: string, revisionId?: string) {
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  const [newestChild] = await db
    .select({ id: campaignRevision.id })
    .from(campaignRevision)
    .where(and(eq(campaignRevision.campaignId, campaignId), isNotNull(campaignRevision.parentRevisionId)))
    .orderBy(desc(campaignRevision.number))
    .limit(1);
  const [current] = c.currentRevisionId ? await db.select().from(campaignRevision).where(eq(campaignRevision.id, c.currentRevisionId)) : [];
  const targetId = revisionId ?? (current?.parentRevisionId ? current.id : newestChild?.id);
  if (!targetId) return null;
  const [target] = await db
    .select()
    .from(campaignRevision)
    .where(and(eq(campaignRevision.id, targetId), eq(campaignRevision.campaignId, campaignId)));
  if (!target?.parentRevisionId) return null;

  const [before, after] = await Promise.all([revisionSummary(target.parentRevisionId), revisionSummary(target.id)]);
  const matched = matchDirections(
    before.directions.map((d) => ({ id: d.id, anchors: new Set(d.anchors.keys()) })),
    after.directions.map((d) => ({ id: d.id, anchors: new Set(d.anchors.keys()) })),
  );
  const byId = (list: RevisionSummary["directions"], id: string) => list.find((d) => d.id === id)!;
  return {
    before,
    after,
    references: diffNames(before.references, after.references),
    inputs: diffNames(before.inputs, after.inputs),
    pairs: matched.matches.map((m) => {
      const a = byId(before.directions, m.a);
      const b = byId(after.directions, m.b);
      return {
        before: a,
        after: b,
        shared: [...a.anchors.keys()].filter((k) => b.anchors.has(k)).map((k) => b.anchors.get(k)!),
        lost: [...a.anchors.keys()].filter((k) => !b.anchors.has(k)).map((k) => a.anchors.get(k)!),
        gained: [...b.anchors.keys()].filter((k) => !a.anchors.has(k)).map((k) => b.anchors.get(k)!),
        creators: diffNames(a.creators, b.creators),
      };
    }),
    dropped: matched.dropped.map((id) => byId(before.directions, id)),
    added: matched.added.map((id) => byId(after.directions, id)),
    packages: [...new Set([...before.packages, ...after.packages].map((p) => p.kind))].map((kind) => ({
      kind,
      before: before.packages.find((p) => p.kind === kind)?.costCents ?? null,
      after: after.packages.find((p) => p.kind === kind)?.costCents ?? null,
    })),
  };
}
