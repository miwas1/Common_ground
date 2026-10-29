// Authorization for campaign, proposal, offer and creator actions (PLAN.md §3.3).
// Rules are evaluated against organization membership in the database, never against
// client-supplied organization IDs. Resources the actor may not see report "not_found"
// so their existence is not revealed; visible resources the actor may not change report "forbidden".

import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { member } from "@/db/auth-schema";
import {
  brandCreator,
  campaign,
  campaignRevision,
  creator,
  offer,
  orgProfile,
  proposal,
  proposalVersion,
  run,
} from "@/db/schema";

export type Actor = { userId: string };

export type Action =
  | { type: "campaign.read"; campaignId: string }
  | { type: "campaign.write"; campaignId: string }
  | { type: "proposal.read"; proposalId: string }
  | { type: "proposal.revise"; proposalId: string }
  | { type: "offer.send"; proposalVersionId: string }
  | { type: "offer.decide"; offerId: string }
  | { type: "creator.write"; creatorId: string }
  /** Manage a brand's creator roster. The organization comes from the actor's membership, never the request. */
  | { type: "roster.manage"; organizationId: string }
  /** Change one creator in that roster: one the brand added, or a shared demo creator. */
  | { type: "roster.creator"; organizationId: string; creatorId: string }
  /** Read and change a brand's profile (its documents and statements). Organization from membership. */
  | { type: "profile.manage"; organizationId: string };

export class AuthorizationError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
  get status() {
    return this.code === "not_found" ? 404 : 403;
  }
}

const notFound = (what: string) => new AuthorizationError("not_found", `${what} not found`);
const forbidden = (why: string) => new AuthorizationError("forbidden", why);

/** What the caller may rely on after a successful check. */
export type Grant = {
  /** The organization the actor is acting for. */
  actingOrganizationId: string;
  /** For offer.send: the parties, derived from the proposal (never from the request). */
  offer?: { fromOrganizationId: string; toOrganizationId: string };
};

async function isMember(db: Db, userId: string, organizationId: string) {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return rows.length > 0;
}

async function orgKind(db: Db, organizationId: string) {
  const [row] = await db.select({ kind: orgProfile.kind }).from(orgProfile).where(eq(orgProfile.organizationId, organizationId));
  return row?.kind;
}

/** The campaign a proposal belongs to, and the creator it casts. */
async function proposalContext(db: Db, proposalId: string) {
  const [row] = await db
    .select({
      campaignId: campaign.id,
      brandOrganizationId: campaign.organizationId,
      isShowcase: campaign.isShowcase,
      creatorOrganizationId: creator.organizationId,
    })
    .from(proposal)
    .innerJoin(run, eq(proposal.runId, run.id))
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .innerJoin(campaign, eq(campaignRevision.campaignId, campaign.id))
    .innerJoin(creator, eq(proposal.creatorId, creator.id))
    .where(eq(proposal.id, proposalId))
    .limit(1);
  return row;
}

/** Whether any version of the proposal has been offered to the organization (and not withdrawn). */
async function offeredTo(db: Db, proposalId: string, organizationId: string) {
  const rows = await db
    .select({ status: offer.status })
    .from(offer)
    .innerJoin(proposalVersion, eq(offer.proposalVersionId, proposalVersion.id))
    .where(and(eq(proposalVersion.proposalId, proposalId), eq(offer.toOrganizationId, organizationId)));
  return rows.some((r) => r.status !== "withdrawn");
}

export async function authorize(db: Db, actor: Actor, action: Action): Promise<Grant> {
  switch (action.type) {
    case "campaign.read":
    case "campaign.write": {
      const [c] = await db.select().from(campaign).where(eq(campaign.id, action.campaignId)).limit(1);
      if (!c) throw notFound("Campaign");
      const memberOfOwner = await isMember(db, actor.userId, c.organizationId);
      if (action.type === "campaign.read") {
        if (c.isShowcase || memberOfOwner) return { actingOrganizationId: c.organizationId };
        throw notFound("Campaign");
      }
      if (!memberOfOwner) throw c.isShowcase ? forbidden("The showcase campaign is read-only") : notFound("Campaign");
      if (c.isShowcase) throw forbidden("The showcase campaign is read-only");
      return { actingOrganizationId: c.organizationId };
    }

    case "proposal.read":
    case "proposal.revise": {
      const ctx = await proposalContext(db, action.proposalId);
      if (!ctx) throw notFound("Proposal");
      if (await isMember(db, actor.userId, ctx.brandOrganizationId)) {
        if (action.type === "proposal.revise" && ctx.isShowcase) throw forbidden("The showcase campaign is read-only");
        return { actingOrganizationId: ctx.brandOrganizationId };
      }
      // A creator sees a proposal only once a version of it has been offered to them.
      if (
        (await isMember(db, actor.userId, ctx.creatorOrganizationId)) &&
        (await offeredTo(db, action.proposalId, ctx.creatorOrganizationId))
      ) {
        if (action.type === "proposal.revise" && ctx.isShowcase) throw forbidden("The showcase campaign is read-only");
        return { actingOrganizationId: ctx.creatorOrganizationId };
      }
      if (action.type === "proposal.read" && ctx.isShowcase) return { actingOrganizationId: ctx.brandOrganizationId };
      throw notFound("Proposal");
    }

    case "offer.send": {
      const [v] = await db
        .select({ proposalId: proposalVersion.proposalId })
        .from(proposalVersion)
        .where(eq(proposalVersion.id, action.proposalVersionId))
        .limit(1);
      if (!v) throw notFound("Proposal version");
      const ctx = await proposalContext(db, v.proposalId);
      if (!ctx || !(await isMember(db, actor.userId, ctx.brandOrganizationId))) throw notFound("Proposal version");
      if (ctx.isShowcase) throw forbidden("The showcase campaign is read-only");
      if ((await orgKind(db, ctx.brandOrganizationId)) !== "brand") throw forbidden("Only brand organizations send offers");
      return {
        actingOrganizationId: ctx.brandOrganizationId,
        offer: { fromOrganizationId: ctx.brandOrganizationId, toOrganizationId: ctx.creatorOrganizationId },
      };
    }

    case "offer.decide": {
      const [o] = await db.select().from(offer).where(eq(offer.id, action.offerId)).limit(1);
      if (!o) throw notFound("Offer");
      if (!(await isMember(db, actor.userId, o.toOrganizationId))) {
        // The sender can see the offer but cannot decide it.
        if (await isMember(db, actor.userId, o.fromOrganizationId)) throw forbidden("Only the recipient can decide an offer");
        throw notFound("Offer");
      }
      if (o.status !== "sent") throw forbidden(`This offer is already ${o.status}`);
      return { actingOrganizationId: o.toOrganizationId };
    }

    case "roster.manage":
    case "roster.creator":
    case "profile.manage": {
      if (!(await isMember(db, actor.userId, action.organizationId))) throw notFound(action.type === "profile.manage" ? "Profile" : "Roster");
      if ((await orgKind(db, action.organizationId)) !== "brand") throw forbidden("Only brand organizations keep a roster and a profile");
      if (action.type === "roster.creator") {
        const [c] = await db.select({ isDemo: creator.isDemo }).from(creator).where(eq(creator.id, action.creatorId)).limit(1);
        const [link] = await db
          .select({ creatorId: brandCreator.creatorId })
          .from(brandCreator)
          .where(and(eq(brandCreator.brandOrganizationId, action.organizationId), eq(brandCreator.creatorId, action.creatorId)))
          .limit(1);
        if (!c || (!link && !c.isDemo)) throw notFound("Creator");
      }
      return { actingOrganizationId: action.organizationId };
    }

    case "creator.write": {
      const [c] = await db
        .select({ organizationId: creator.organizationId })
        .from(creator)
        .where(eq(creator.id, action.creatorId))
        .limit(1);
      if (!c || !(await isMember(db, actor.userId, c.organizationId))) throw notFound("Creator");
      return { actingOrganizationId: c.organizationId };
    }
  }
}
