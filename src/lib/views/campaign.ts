import "server-only";

// Read models for the campaign pages. Every loader is called after requireAuthorized(campaign.read).

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  brandCreator,
  brandDocument,
  brandFact,
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
  discoveredCreator,
  evidence,
  portfolioItem,
  proposal,
  proposalVersion,
  quote,
  resolvedReference,
  run,
  runStage,
} from "@/db/schema";
import type { BriefForm } from "@/lib/pipeline/context";
import type { AudienceComparison } from "@/lib/pipeline/stages/audience";
import type { ParsedBrief } from "@/lib/pipeline/stages/brief";
import { withoutStatementKeys, type FitOutput } from "@/lib/pipeline/stages/fit";
import { STAGES } from "@/lib/pipeline/stages";
import { shortlistOrder, type BandResult, type Capability } from "@/lib/pipeline/stages/cast";
import type { ResolveOutput } from "@/lib/pipeline/stages/resolve";
import type { UnderstandOutput } from "@/lib/pipeline/stages/understand";

export async function getCampaignHeader(campaignId: string) {
  const db = await getDb();
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  const [rev] = c.currentRevisionId ? await db.select().from(campaignRevision).where(eq(campaignRevision.id, c.currentRevisionId)) : [];
  const [latestRun] = rev ? await db.select().from(run).where(and(eq(run.revisionId, rev.id), eq(run.mode, "qloo"))).orderBy(desc(run.createdAt)).limit(1) : [];
  return { campaign: c, revision: rev ?? null, brief: (rev?.brief ?? null) as BriefForm | null, run: latestRun ?? null };
}

/**
 * Typical seconds per stage: the median of recently finished stages, once there are enough of them,
 * else the stage's built-in guess. "Looking up names" is excluded: its time includes waiting for the user.
 */
async function typicalStageSeconds(db: Awaited<ReturnType<typeof getDb>>) {
  const rows = await db
    .select({ position: runStage.position, startedAt: runStage.startedAt, finishedAt: runStage.finishedAt })
    .from(runStage)
    .where(and(eq(runStage.status, "done"), isNotNull(runStage.startedAt), isNotNull(runStage.finishedAt)))
    .orderBy(desc(runStage.finishedAt))
    .limit(400);
  return new Map(
    STAGES.map((s) => {
      const samples = rows
        .filter((r) => r.position === s.position && s.position !== 2)
        .map((r) => (r.finishedAt!.getTime() - r.startedAt!.getTime()) / 1000)
        .filter((sec) => sec > 0)
        .sort((a, b) => a - b);
      return [s.position, samples.length >= 3 ? Math.round(samples[Math.floor(samples.length / 2)]) : s.typicalSeconds];
    }),
  );
}

export async function getRunProgress(runId: string) {
  const db = await getDb();
  const [r] = await db.select().from(run).where(eq(run.id, runId));
  const stages = await db.select().from(runStage).where(eq(runStage.runId, runId)).orderBy(runStage.position);
  const refs = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, r.revisionId));
  const typical = await typicalStageSeconds(db);
  const output = <T,>(position: number) => (stages.find((x) => x.position === position && x.status === "done")?.output ?? null) as T | null;
  return {
    run: r,
    stages: STAGES.map((s) => {
      const row = stages.find((x) => x.position === s.position);
      return {
        position: s.position,
        name: s.name,
        doing: s.doing,
        status: row?.status ?? "pending",
        error: row?.error ?? null,
        startedAt: row?.startedAt?.toISOString() ?? null,
        finishedAt: row?.finishedAt?.toISOString() ?? null,
        typicalSeconds: typical.get(s.position) ?? s.typicalSeconds,
      };
    }),
    understanding: output<UnderstandOutput>(0),
    lookup: output<ResolveOutput>(2),
    needsChoice: refs.filter((x) => x.status === "needs_input"),
    references: refs,
  };
}

export type ClaimView = {
  id: string;
  kind: "finding" | "interpretation" | "portfolio" | "commercial";
  text: string;
  /** For interpretations: the finding claims they rest on. */
  basedOn: string[];
  /** Baseline interpretations only: the brief statements they cite. */
  basis: string[];
  portfolioItemIds: string[];
  /** Findings only: the Qloo result behind the sentence, for compact display. The sentence stays the record. */
  signal?: Signal;
};

export type Signal = {
  label: string;
  /** What kind of result list it came from, e.g. "lifestyle concepts", "podcasts". */
  category: string | null;
  rank: number | null;
  of: number | null;
  /** 0–1, comparable only within the same query. */
  affinity: number | null;
};

/** Claims for a set of owners, with bindings resolved for display. */
export async function getClaims(ownerIds: string[]): Promise<Map<string, ClaimView[]>> {
  const out = new Map<string, ClaimView[]>();
  if (ownerIds.length === 0) return out;
  const db = await getDb();
  const claims = await db.select().from(claim).where(inArray(claim.ownerId, ownerIds));
  const bindings = claims.length ? await db.select().from(claimBinding).where(inArray(claimBinding.claimId, claims.map((c) => c.id))) : [];
  const evidenceIds = bindings.map((b) => b.evidenceId).filter((x): x is string => Boolean(x));
  const evidenceRows = evidenceIds.length ? await db.select().from(evidence).where(inArray(evidence.id, evidenceIds)) : [];

  for (const c of claims) {
    const mine = bindings.filter((b) => b.claimId === c.id);
    const view: ClaimView = {
      id: c.id,
      kind: c.kind,
      text: c.text,
      basedOn: mine.map((b) => b.findingClaimId).filter((x): x is string => Boolean(x)),
      basis: c.basis ?? [],
      portfolioItemIds: mine.map((b) => b.portfolioItemId).filter((x): x is string => Boolean(x)),
    };
    const ev = c.kind === "finding" ? evidenceRows.find((e) => mine.some((b) => b.evidenceId === e.id)) : undefined;
    if (ev && ev.kind !== "demographic") {
      const values = ev.values as { affinity?: number; context?: { resultLabel?: string } };
      view.signal = { label: ev.label, category: values.context?.resultLabel ?? null, rank: ev.rank, of: ev.resultCount, affinity: values.affinity ?? null };
    }
    out.set(c.ownerId, [...(out.get(c.ownerId) ?? []), view]);
  }
  return out;
}

export async function getStrategy(runId: string) {
  const db = await getDb();
  const [r] = await db.select().from(run).where(eq(run.id, runId));
  const [{ organizationId }] = await db
    .select({ organizationId: campaign.organizationId })
    .from(campaignRevision)
    .innerJoin(campaign, eq(campaign.id, campaignRevision.campaignId))
    .where(eq(campaignRevision.id, r.revisionId));
  const dirs = await db.select().from(direction).where(eq(direction.runId, runId)).orderBy(direction.colorIndex);
  const checks = dirs.length ? await db.select().from(directionCheck).where(inArray(directionCheck.directionId, dirs.map((d) => d.id))) : [];
  const claims = await getClaims(dirs.map((d) => d.id));
  const fits = await db.select().from(creatorFit).where(and(eq(creatorFit.runId, runId), eq(creatorFit.shortlisted, true)));
  const creators = fits.length ? await db.select().from(creator).where(inArray(creator.id, fits.map((f) => f.creatorId))) : [];
  const links = fits.length
    ? await db.select().from(brandCreator).where(and(eq(brandCreator.brandOrganizationId, organizationId), inArray(brandCreator.creatorId, fits.map((f) => f.creatorId))))
    : [];
  const found = await db.select().from(discoveredCreator).where(eq(discoveredCreator.runId, runId)).orderBy(discoveredCreator.rank);
  const stages = await db.select().from(runStage).where(and(eq(runStage.runId, runId), inArray(runStage.position, [1, 3, 11])));
  const fit = stages.find((s) => s.position === 11)?.output as FitOutput | undefined;
  const citedIds = [...new Set((fit?.directions ?? []).flatMap((d) => d.factIds))];
  const cited = citedIds.length
    ? await db
        .select({ id: brandFact.id, kind: brandFact.kind, text: brandFact.text, quote: brandFact.quote, page: brandFact.page, documentName: brandDocument.name })
        .from(brandFact)
        .leftJoin(brandDocument, eq(brandDocument.id, brandFact.documentId))
        .where(inArray(brandFact.id, citedIds))
    : [];
  const audienceStage = stages.find((s) => s.position === 3);
  const parsed = stages.find((s) => s.position === 1)?.output as ParsedBrief | undefined;
  const inputs = await db.select().from(briefInput).where(eq(briefInput.revisionId, r.revisionId));
  return {
    inputs,
    comparison: (audienceStage?.output as { comparison?: AudienceComparison } | undefined)?.comparison ?? null,
    /** Ages the brief is aiming at, to compare creators' audiences with. */
    intendedAges: (parsed?.intendedAudience?.ageBands ?? []) as string[],
    directions: dirs.map((d) => ({
      direction: d,
      checks: Object.fromEntries(checks.filter((c) => c.directionId === d.id).map((c) => [c.kind, c.result as Record<string, unknown>])),
      claims: claims.get(d.id) ?? [],
      shortlist: fits
        .filter((f) => f.directionId === d.id)
        .map((f) => {
          const link = links.find((l) => l.creatorId === f.creatorId) ?? null;
          return {
            fit: f,
            creator: creators.find((c) => c.id === f.creatorId)!,
            preferred: link?.preferred ?? false,
            sortKey: {
              capability: f.capability as Capability,
              bands: f.culturalBands as Record<string, BandResult>,
              cheapestCents: (f.hardConstraints as { cheapestCents: number | null }).cheapestCents,
              preferred: link?.preferred ?? false,
            },
          };
        })
        .sort((a, b) => shortlistOrder(a.sortKey, b.sortKey)),
      discovered: found.filter((x) => x.directionId === d.id),
      /** How the direction sits with the brand's approved profile; null when there was nothing to check. */
      profileFit: (() => {
        const f = fit?.checked ? fit.directions.find((x) => x.directionId === d.id) : undefined;
        return f
          ? { ...f, note: withoutStatementKeys(f.note), facts: f.factIds.map((id) => cited.find((c) => c.id === id)).filter((x): x is (typeof cited)[number] => Boolean(x)) }
          : null;
      })(),
    })),
  };
}

/** A run's proposals; ones set aside by a creator swap are left out unless asked for. */
export async function getProposals(runId: string, opts: { includeSetAside?: boolean } = {}) {
  const db = await getDb();
  const rows = (await db.select().from(proposal).where(eq(proposal.runId, runId))).filter((p) => opts.includeSetAside || p.status !== "set_aside");
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
  const all = await getProposals(runId, { includeSetAside: true });
  const item = all.find((p) => p.proposal.id === proposalId);
  if (!item) return null;
  const db = await getDb();
  const claims = await getClaims([item.version.id, ...(item.fit ? [item.fit.id] : []), item.direction.id]);
  const terms = item.version.terms as { quoteId: string | null };
  const [q] = terms.quoteId ? await db.select().from(quote).where(eq(quote.id, terms.quoteId)) : [];
  return { ...item, claims: claims.get(item.version.id) ?? [], fitClaims: item.fit ? (claims.get(item.fit.id) ?? []) : [], directionClaims: claims.get(item.direction.id) ?? [], quote: q };
}

export async function getPackages(runId: string) {
  const db = await getDb();
  const pkgs = await db.select().from(budgetPackage).where(eq(budgetPackage.runId, runId));
  const proposals = await getProposals(runId);
  return pkgs.map((p) => ({ pkg: p, proposals: p.proposalIds.map((id) => proposals.find((x) => x.proposal.id === id)!).filter(Boolean) }));
}
