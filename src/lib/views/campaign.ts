import "server-only";

// Read models for the campaign pages. Every loader is called after requireAuthorized(campaign.read).

import { and, desc, eq, inArray } from "drizzle-orm";
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
  directionCheck,
  evidence,
  portfolioItem,
  proposal,
  proposalVersion,
  qlooCall,
  quote,
  resolvedReference,
  run,
  runStage,
} from "@/db/schema";
import type { BriefForm } from "@/lib/pipeline/context";
import type { AudienceComparison } from "@/lib/pipeline/stages/audience";
import { STAGES } from "@/lib/pipeline/stages";
import { shortlistOrder, type BandResult, type Capability } from "@/lib/pipeline/stages/cast";

export async function getCampaignHeader(campaignId: string) {
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  const [rev] = c.currentRevisionId ? await db.select().from(campaignRevision).where(eq(campaignRevision.id, c.currentRevisionId)) : [];
  const [latestRun] = rev ? await db.select().from(run).where(eq(run.revisionId, rev.id)).orderBy(desc(run.createdAt)).limit(1) : [];
  return { campaign: c, revision: rev ?? null, brief: (rev?.brief ?? null) as BriefForm | null, run: latestRun ?? null };
}

export async function getRunProgress(runId: string) {
  const db = await getDb();
  const [r] = await db.select().from(run).where(eq(run.id, runId));
  const stages = await db.select().from(runStage).where(eq(runStage.runId, runId)).orderBy(runStage.position);
  const refs = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, r.revisionId));
  return {
    run: r,
    stages: STAGES.map((s) => {
      const row = stages.find((x) => x.position === s.position);
      return { position: s.position, name: s.name, status: row?.status ?? "pending", error: row?.error ?? null };
    }),
    needsChoice: refs.filter((x) => x.status === "needs_input"),
    references: refs,
  };
}

export type ClaimView = {
  id: string;
  kind: "finding" | "interpretation" | "portfolio" | "commercial";
  text: string;
  /** For findings: the Qloo request that produced the evidence. */
  provenance?: { endpoint: string; params: Record<string, string>; cached: boolean; at: string } | null;
  /** For interpretations: the finding claims they rest on. */
  basedOn: string[];
  portfolioItemIds: string[];
};

/** Claims for a set of owners, with bindings resolved for display. */
export async function getClaims(ownerIds: string[]): Promise<Map<string, ClaimView[]>> {
  const out = new Map<string, ClaimView[]>();
  if (ownerIds.length === 0) return out;
  const db = await getDb();
  const claims = await db.select().from(claim).where(inArray(claim.ownerId, ownerIds));
  const bindings = claims.length ? await db.select().from(claimBinding).where(inArray(claimBinding.claimId, claims.map((c) => c.id))) : [];
  const evidenceIds = bindings.map((b) => b.evidenceId).filter((x): x is string => Boolean(x));
  const evRows = evidenceIds.length ? await db.select({ id: evidence.id, callId: evidence.qlooCallId }).from(evidence).where(inArray(evidence.id, evidenceIds)) : [];
  const callIds = evRows.map((e) => e.callId).filter((x): x is string => Boolean(x));
  const calls = callIds.length ? await db.select().from(qlooCall).where(inArray(qlooCall.id, callIds)) : [];

  for (const c of claims) {
    const mine = bindings.filter((b) => b.claimId === c.id);
    const ev = evRows.find((e) => e.id === mine.find((b) => b.evidenceId)?.evidenceId);
    const call = calls.find((x) => x.id === ev?.callId);
    const view: ClaimView = {
      id: c.id,
      kind: c.kind,
      text: c.text,
      provenance: call ? { endpoint: call.endpoint, params: call.params as Record<string, string>, cached: call.cached, at: call.createdAt.toISOString() } : null,
      basedOn: mine.map((b) => b.findingClaimId).filter((x): x is string => Boolean(x)),
      portfolioItemIds: mine.map((b) => b.portfolioItemId).filter((x): x is string => Boolean(x)),
    };
    out.set(c.ownerId, [...(out.get(c.ownerId) ?? []), view]);
  }
  return out;
}

export async function getStrategy(runId: string) {
  const db = await getDb();
  const [r] = await db.select().from(run).where(eq(run.id, runId));
  const dirs = await db.select().from(direction).where(eq(direction.runId, runId)).orderBy(direction.colorIndex);
  const checks = dirs.length ? await db.select().from(directionCheck).where(inArray(directionCheck.directionId, dirs.map((d) => d.id))) : [];
  const claims = await getClaims(dirs.map((d) => d.id));
  const fits = await db.select().from(creatorFit).where(and(eq(creatorFit.runId, runId), eq(creatorFit.shortlisted, true)));
  const creators = fits.length ? await db.select().from(creator).where(inArray(creator.id, fits.map((f) => f.creatorId))) : [];
  const [audienceStage] = await db.select().from(runStage).where(and(eq(runStage.runId, runId), eq(runStage.position, 3)));
  const inputs = await db.select().from(briefInput).where(eq(briefInput.revisionId, r.revisionId));
  return {
    inputs,
    comparison: (audienceStage?.output as { comparison?: AudienceComparison } | undefined)?.comparison ?? null,
    directions: dirs.map((d) => ({
      direction: d,
      checks: Object.fromEntries(checks.filter((c) => c.directionId === d.id).map((c) => [c.kind, c.result as Record<string, unknown>])),
      claims: claims.get(d.id) ?? [],
      shortlist: fits
        .filter((f) => f.directionId === d.id)
        .map((f) => ({
          fit: f,
          creator: creators.find((c) => c.id === f.creatorId)!,
          sortKey: { capability: f.capability as Capability, bands: f.culturalBands as Record<string, BandResult>, cheapestCents: (f.hardConstraints as { cheapestCents: number | null }).cheapestCents },
        }))
        .sort((a, b) => shortlistOrder(a.sortKey, b.sortKey)),
    })),
  };
}

export async function getProposals(runId: string) {
  const db = await getDb();
  const rows = await db.select().from(proposal).where(eq(proposal.runId, runId));
  const versions = rows.length ? await db.select().from(proposalVersion).where(inArray(proposalVersion.proposalId, rows.map((r) => r.id))) : [];
  const creators = rows.length ? await db.select().from(creator).where(inArray(creator.id, rows.map((r) => r.creatorId))) : [];
  const dirs = await db.select().from(direction).where(eq(direction.runId, runId));
  const items = rows.length ? await db.select().from(portfolioItem).where(inArray(portfolioItem.creatorId, rows.map((r) => r.creatorId))) : [];
  const fits = await db.select().from(creatorFit).where(eq(creatorFit.runId, runId));
  return rows.map((p) => ({
    proposal: p,
    version: versions.find((v) => v.id === p.currentVersionId)!,
    creator: creators.find((c) => c.id === p.creatorId)!,
    direction: dirs.find((d) => d.id === p.directionId)!,
    portfolio: items.filter((i) => i.creatorId === p.creatorId),
    fit: fits.find((f) => f.creatorId === p.creatorId && f.directionId === p.directionId) ?? null,
  }));
}

export async function getProposalDetail(runId: string, proposalId: string) {
  const all = await getProposals(runId);
  const item = all.find((p) => p.proposal.id === proposalId);
  if (!item) return null;
  const db = await getDb();
  const claims = await getClaims([item.version.id, ...(item.fit ? [item.fit.id] : []), item.direction.id]);
  const terms = item.version.terms as { quoteId: string };
  const [q] = await db.select().from(quote).where(eq(quote.id, terms.quoteId));
  return { ...item, claims: claims.get(item.version.id) ?? [], fitClaims: item.fit ? (claims.get(item.fit.id) ?? []) : [], directionClaims: claims.get(item.direction.id) ?? [], quote: q };
}

export async function getPackages(runId: string) {
  const db = await getDb();
  const pkgs = await db.select().from(budgetPackage).where(eq(budgetPackage.runId, runId));
  const proposals = await getProposals(runId);
  return pkgs.map((p) => ({ pkg: p, proposals: p.proposalIds.map((id) => proposals.find((x) => x.proposal.id === id)!).filter(Boolean) }));
}
