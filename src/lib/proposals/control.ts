import "server-only";

// Changing one decision without redoing the research: edit a proposal, ask for a simpler version of
// the same idea, or swap the creator. Every change is a new immutable version (or, for a swap, a new
// proposal with the old one set aside), so human edits are never overwritten and history stays visible.
// Evidence carries over through the claim helpers: findings are re-rendered from their evidence rows.

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignRevision, claim, claimBinding, creator, creatorFit, direction, proposal, proposalVersion, run } from "@/db/schema";
import { attachBriefInterpretation, attachCommercialClaim, attachFindings, attachInterpretation, attachPortfolioClaim, type ClaimOwner } from "@/lib/claims/persist";
import { checkClaims, type Issue } from "@/lib/claims/validate";
import { objectWithValidation, type Llm } from "@/lib/llm";
import type { StageCtx } from "@/lib/pipeline/context";
import { planBudget } from "@/lib/pipeline/stages/budget";
import { shortlistOrder, type BandResult, type Capability } from "@/lib/pipeline/stages/cast";
import { draftProposal } from "@/lib/pipeline/stages/proposals";
import type { QlooApi } from "@/lib/qloo/api";

export type Concept = { title: string; logline: string; hook: string; beats: string[]; productIntegration: string; setting: string; openQuestions?: string[] };
export type Deliverable = { format: string; count: number; notes: string };

/** A change the user can fix or retry; its message is shown beside the form. */
export class ProposalError extends Error {}

async function nameOf(db: Db, userId: string) {
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  return u?.name || "your team";
}

async function scope(db: Db, proposalId: string) {
  const [row] = await db
    .select({ proposal, version: proposalVersion, run, campaignId: campaign.id })
    .from(proposal)
    .innerJoin(proposalVersion, eq(proposal.currentVersionId, proposalVersion.id))
    .innerJoin(run, eq(proposal.runId, run.id))
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .innerJoin(campaign, eq(campaignRevision.campaignId, campaign.id))
    .where(eq(proposal.id, proposalId));
  if (!row) throw new ProposalError("Proposal not found.");
  if (row.proposal.status === "set_aside") throw new ProposalError("This proposal was replaced; change the one that replaced it.");
  return row;
}

/** Re-attach a version's claims to a new version: same evidence, same portfolio items, same quote. */
async function carryClaims(db: Db, runId: string, fromVersionId: string, to: ClaimOwner) {
  const claims = await db.select().from(claim).where(and(eq(claim.ownerType, "proposal_version"), eq(claim.ownerId, fromVersionId)));
  if (claims.length === 0) return;
  const bindings = await db.select().from(claimBinding).where(inArray(claimBinding.claimId, claims.map((c) => c.id)));
  const bound = (id: string) => bindings.filter((b) => b.claimId === id);

  const findings = claims.filter((c) => c.kind === "finding");
  const evidenceOf = new Map(findings.map((f) => [f.id, bound(f.id).find((b) => b.evidenceId)?.evidenceId]));
  const newFindingByEvidence = await attachFindings(db, runId, to, [...evidenceOf.values()].filter((x): x is string => Boolean(x)));
  for (const c of claims) {
    if (c.kind === "interpretation") {
      const cited = bound(c.id)
        .map((b) => (b.findingClaimId ? newFindingByEvidence.get(evidenceOf.get(b.findingClaimId) ?? "") : undefined))
        .filter((x): x is string => Boolean(x));
      if (cited.length) await attachInterpretation(db, runId, to, c.text, cited);
      else if (c.basis?.length) await attachBriefInterpretation(db, runId, to, c.text, c.basis);
    } else if (c.kind === "portfolio") {
      const items = bound(c.id).map((b) => b.portfolioItemId).filter((x): x is string => Boolean(x));
      if (items.length) await attachPortfolioClaim(db, runId, to, c.text, items);
    } else if (c.kind === "commercial") {
      const q = bound(c.id).find((b) => b.quoteId)?.quoteId;
      if (q) await attachCommercialClaim(db, runId, to, c.text, q);
    }
  }
}

async function newVersion(
  db: Db,
  s: Awaited<ReturnType<typeof scope>>,
  values: { authorRole: "brand" | "agent"; authorUserId: string; concept: Concept; deliverables: Deliverable[]; hypothesis: string; changeNote: string },
) {
  const [last] = await db.select({ n: proposalVersion.number }).from(proposalVersion).where(eq(proposalVersion.proposalId, s.proposal.id)).orderBy(desc(proposalVersion.number)).limit(1);
  const [v] = await db
    .insert(proposalVersion)
    .values({ proposalId: s.proposal.id, number: (last?.n ?? 0) + 1, terms: s.version.terms, ...values })
    .returning({ id: proposalVersion.id });
  await carryClaims(db, s.run.id, s.version.id, { type: "proposal_version", id: v.id });
  await db.update(proposal).set({ currentVersionId: v.id }).where(eq(proposal.id, s.proposal.id));
  return v.id;
}

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  logline: "summary",
  hook: "opening line",
  beats: "story beats",
  productIntegration: "how the product appears",
  setting: "setting",
  openQuestions: "open questions",
  deliverables: "deliverables",
  hypothesis: "what this tests",
};

/** Deliverables in a fixed shape, so a comparison sees content changes, not key order. */
const sameDeliverables = (a: unknown, b: Deliverable[]) =>
  JSON.stringify(((a as Deliverable[]) ?? []).map((d) => [d.count, d.format, d.notes ?? ""])) === JSON.stringify(b.map((d) => [d.count, d.format, d.notes ?? ""]));

/** The user's own edit, kept exactly as written. */
export async function editProposal(db: Db, proposalId: string, userId: string, input: { concept: Concept; deliverables: Deliverable[]; hypothesis: string }) {
  const s = await scope(db, proposalId);
  const before = s.version.concept as Concept;
  const changed = [
    ...(Object.keys(FIELD_LABEL) as (keyof Concept)[]).filter((k) => k in input.concept && JSON.stringify(before[k] ?? null) !== JSON.stringify(input.concept[k] ?? null)),
    ...(!sameDeliverables(s.version.deliverables, input.deliverables) ? ["deliverables"] : []),
    ...(s.version.hypothesis !== input.hypothesis ? ["hypothesis"] : []),
  ];
  if (changed.length === 0) throw new ProposalError("Nothing changed.");
  if (input.concept.beats.length === 0) throw new ProposalError("Keep at least one story beat.");
  return newVersion(db, s, {
    authorRole: "brand",
    authorUserId: userId,
    concept: input.concept,
    deliverables: input.deliverables,
    hypothesis: input.hypothesis,
    changeNote: `Edited by ${await nameOf(db, userId)}: ${changed.map((k) => FIELD_LABEL[k] ?? k).join(", ")}`,
  });
}

const Simpler = z.object({
  concept: z.object({
    title: z.string(),
    logline: z.string(),
    hook: z.string(),
    beats: z.array(z.string()),
    productIntegration: z.string(),
    setting: z.string(),
  }),
  deliverables: z.array(z.object({ format: z.string(), count: z.number(), notes: z.string() })),
  hypothesis: z.string(),
  openQuestions: z.array(z.string()),
  simplified: z.array(z.string()).describe("What was made simpler, in a few words each"),
});

/** The same idea, cheaper and faster to make. */
export async function simplerVersion(db: Db, llm: Llm, proposalId: string, userId: string) {
  const s = await scope(db, proposalId);
  const concept = s.version.concept as Concept;
  const [d] = await db.select({ title: direction.title }).from(direction).where(eq(direction.id, s.proposal.directionId));
  const out = await objectWithValidation(
    llm,
    {
      name: "simpler production",
      system: `You are a creative producer. Rewrite a creator video proposal so it is simpler to make, keeping the same idea, the same opening line idea and the same role for the product.
Simpler means: one location, available light, one person on camera, shot on a phone, 3 to 5 beats, no props or extras that need buying, and no more deliverables than before.
Make no claims about the creator's audience, sales or performance.`,
      prompt: `<direction>${d?.title ?? ""}</direction>\n<current_proposal>\n${JSON.stringify({ concept, deliverables: s.version.deliverables, hypothesis: s.version.hypothesis })}\n</current_proposal>\nWrite the simpler version.`,
      schema: Simpler,
      effort: "medium",
    },
    (v) => {
      const issues: Issue[] = [];
      if (v.concept.beats.length < 3 || v.concept.beats.length > 6) issues.push({ path: "concept.beats", message: "give 3–5 beats" });
      const copy = [v.concept.title, v.concept.logline, v.concept.hook, v.concept.productIntegration, ...v.concept.beats, v.hypothesis, ...v.openQuestions];
      copy.forEach((c, i) => issues.push(...checkClaims(c, `copy[${i}]`)));
      if (v.simplified.length === 0) issues.push({ path: "simplified", message: "say what was simplified" });
      return issues;
    },
  );
  return newVersion(db, s, {
    authorRole: "agent",
    authorUserId: userId,
    concept: { ...out.concept, openQuestions: out.openQuestions },
    deliverables: out.deliverables,
    hypothesis: out.hypothesis,
    changeNote: `Same idea, simpler production (asked by ${await nameOf(db, userId)}): ${out.simplified.join("; ")}`,
  });
}

/** Creators who passed the hard checks for this proposal's direction and don't already have a proposal there. */
export async function swapCandidates(db: Db, proposalId: string) {
  const s = await scope(db, proposalId);
  const taken = await db
    .select({ creatorId: proposal.creatorId })
    .from(proposal)
    .where(and(eq(proposal.runId, s.run.id), eq(proposal.directionId, s.proposal.directionId), ne(proposal.status, "set_aside")));
  const fits = await db.select().from(creatorFit).where(and(eq(creatorFit.runId, s.run.id), eq(creatorFit.directionId, s.proposal.directionId)));
  const open = fits.filter((f) => (f.hardConstraints as { passed: boolean }).passed && !taken.some((t) => t.creatorId === f.creatorId));
  const people = open.length ? await db.select().from(creator).where(inArray(creator.id, open.map((f) => f.creatorId))) : [];
  return open
    .map((f) => ({
      creator: people.find((c) => c.id === f.creatorId)!,
      capability: f.capability as Capability,
      bands: f.culturalBands as Record<string, BandResult>,
      cheapestCents: (f.hardConstraints as { cheapestCents: number | null }).cheapestCents,
    }))
    .filter((x) => x.capability.level !== "none")
    .sort(shortlistOrder);
}

/** Replace the creator on a proposal: draft one for the new creator, set the old one aside, re-plan the budget. */
export async function swapCreator(db: Db, deps: { qloo: QlooApi; llm: Llm }, proposalId: string, newCreatorId: string, userId: string, reason: string) {
  const s = await scope(db, proposalId);
  const candidates = await swapCandidates(db, proposalId);
  if (!candidates.some((c) => c.creator.id === newCreatorId)) throw new ProposalError("That creator can't take this proposal.");
  const ctx: StageCtx = { db, runId: s.run.id, qloo: deps.qloo, llm: deps.llm, mode: s.run.mode };
  const newId = await draftProposal(ctx, s.proposal.directionId, newCreatorId);
  const [old] = await db.select({ name: creator.displayName }).from(creator).where(eq(creator.id, s.proposal.creatorId));
  const [created] = await db.select({ versionId: proposal.currentVersionId }).from(proposal).where(eq(proposal.id, newId));
  await db
    .update(proposalVersion)
    .set({ changeNote: `Replaces ${old?.name ?? "the previous creator"} (by ${await nameOf(db, userId)})${reason ? `: ${reason}` : ""}` })
    .where(eq(proposalVersion.id, created.versionId!));
  await db.update(proposal).set({ status: "set_aside" }).where(eq(proposal.id, proposalId));
  await planBudget(ctx);
  return { proposalId: newId, campaignId: s.campaignId };
}

export async function versionHistory(db: Db, proposalId: string) {
  return db
    .select({ id: proposalVersion.id, number: proposalVersion.number, authorRole: proposalVersion.authorRole, changeNote: proposalVersion.changeNote, createdAt: proposalVersion.createdAt, author: user.name })
    .from(proposalVersion)
    .leftJoin(user, eq(user.id, proposalVersion.authorUserId))
    .where(eq(proposalVersion.proposalId, proposalId))
    .orderBy(desc(proposalVersion.number));
}
