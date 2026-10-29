import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { brandCreator, creator, direction, offer, proposal, proposalVersion, run } from "@/db/schema";
import { createCampaign, createOrg, createUser } from "@/test/fixtures";
import { authorize, AuthorizationError, type Action } from "./authorize";

async function createProposal(db: Db, revisionId: string, creatorOrgId: string) {
  const [r] = await db.insert(run).values({ revisionId, status: "done" }).returning();
  const [d] = await db
    .insert(direction)
    .values({ runId: r.id, title: "The kitchen between courses", audienceContext: "x", productRole: "x" })
    .returning();
  const [c] = await db
    .insert(creator)
    .values({ organizationId: creatorOrgId, displayName: "Creator", city: "Portland", country: "US" })
    .returning();
  const [p] = await db.insert(proposal).values({ runId: r.id, directionId: d.id, creatorId: c.id }).returning();
  const [v] = await db
    .insert(proposalVersion)
    .values({ proposalId: p.id, number: 1, authorRole: "agent", concept: {}, deliverables: [], terms: {}, hypothesis: "h" })
    .returning();
  return { proposalId: p.id, versionId: v.id, creatorId: c.id };
}

describe("authorize", { timeout: 30_000 }, () => {
  let db: Db;
  const u: Record<string, string> = {};
  const org: Record<string, string> = {};
  let campaignX: string;
  let showcase: string;
  let px: { proposalId: string; versionId: string; creatorId: string };
  let pShowcase: { proposalId: string; versionId: string; creatorId: string };

  const as = (user: string, action: Action) => authorize(db, { userId: u[user] }, action);
  const denied = async (user: string, action: Action, code: "not_found" | "forbidden") => {
    const err = await as(user, action).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect((err as AuthorizationError).code).toBe(code);
  };

  beforeAll(async () => {
    db = await openPglite("memory://");
    for (const name of ["alex", "sam", "blake", "maya", "dev"]) u[name] = await createUser(db, name);
    org.juniper = await createOrg(db, { kind: "brand", members: [{ userId: u.alex, role: "owner" }, { userId: u.sam }] });
    org.otherBrand = await createOrg(db, { kind: "brand", members: [{ userId: u.blake, role: "owner" }] });
    org.maya = await createOrg(db, { kind: "creator", members: [{ userId: u.maya, role: "owner" }] });
    org.dev = await createOrg(db, { kind: "creator", members: [{ userId: u.dev, role: "owner" }] });

    const x = await createCampaign(db, { organizationId: org.juniper, userId: u.alex });
    campaignX = x.campaignId;
    px = await createProposal(db, x.revisionId, org.maya);

    const s = await createCampaign(db, { organizationId: org.otherBrand, isShowcase: true });
    showcase = s.campaignId;
    pShowcase = await createProposal(db, s.revisionId, org.dev);
  });

  describe("campaigns", () => {
    it("lets every member of the owning brand read and write", async () => {
      expect((await as("alex", { type: "campaign.write", campaignId: campaignX })).actingOrganizationId).toBe(org.juniper);
      expect((await as("sam", { type: "campaign.write", campaignId: campaignX })).actingOrganizationId).toBe(org.juniper);
    });

    it("hides another brand's campaign from outsiders, including creators", async () => {
      await denied("blake", { type: "campaign.read", campaignId: campaignX }, "not_found");
      await denied("maya", { type: "campaign.read", campaignId: campaignX }, "not_found");
      await denied("blake", { type: "campaign.write", campaignId: campaignX }, "not_found");
    });

    it("makes the showcase readable by anyone and writable by no one", async () => {
      await as("maya", { type: "campaign.read", campaignId: showcase });
      await denied("blake", { type: "campaign.write", campaignId: showcase }, "forbidden");
      await denied("alex", { type: "campaign.write", campaignId: showcase }, "forbidden");
    });

    it("reports unknown campaigns as not found", async () => {
      await denied("alex", { type: "campaign.read", campaignId: crypto.randomUUID() }, "not_found");
    });
  });

  describe("proposals and offers", () => {
    let offerId: string;

    it("hides a proposal from its creator until it is offered", async () => {
      await denied("maya", { type: "proposal.read", proposalId: px.proposalId }, "not_found");
    });

    it("derives offer parties from the proposal, not the request", async () => {
      const grant = await as("alex", { type: "offer.send", proposalVersionId: px.versionId });
      expect(grant.offer).toEqual({ fromOrganizationId: org.juniper, toOrganizationId: org.maya });
      const [o] = await db
        .insert(offer)
        .values({ proposalVersionId: px.versionId, sentBy: u.alex, ...grant.offer! })
        .returning();
      offerId = o.id;
    });

    it("does not let outsiders or creators send offers", async () => {
      await denied("blake", { type: "offer.send", proposalVersionId: px.versionId }, "not_found");
      await denied("maya", { type: "offer.send", proposalVersionId: px.versionId }, "not_found");
      await denied("blake", { type: "offer.send", proposalVersionId: pShowcase.versionId }, "forbidden");
    });

    it("shows the offered proposal to its creator only", async () => {
      expect((await as("maya", { type: "proposal.read", proposalId: px.proposalId })).actingOrganizationId).toBe(org.maya);
      await as("maya", { type: "proposal.revise", proposalId: px.proposalId });
      await denied("dev", { type: "proposal.read", proposalId: px.proposalId }, "not_found");
    });

    it("lets only the recipient decide, and only while the offer is open", async () => {
      await denied("alex", { type: "offer.decide", offerId }, "forbidden");
      await denied("dev", { type: "offer.decide", offerId }, "not_found");
      expect((await as("maya", { type: "offer.decide", offerId })).actingOrganizationId).toBe(org.maya);

      await db.update(offer).set({ status: "accepted", decidedBy: u.maya }).where(eq(offer.id, offerId));
      await denied("maya", { type: "offer.decide", offerId }, "forbidden");
    });

    it("keeps showcase proposals readable but not revisable", async () => {
      await as("maya", { type: "proposal.read", proposalId: pShowcase.proposalId });
      await denied("blake", { type: "proposal.revise", proposalId: pShowcase.proposalId }, "forbidden");
    });
  });

  describe("creators", () => {
    it("lets only the creator's own organization edit their profile", async () => {
      expect((await as("maya", { type: "creator.write", creatorId: px.creatorId })).actingOrganizationId).toBe(org.maya);
      await denied("alex", { type: "creator.write", creatorId: px.creatorId }, "not_found");
      await denied("dev", { type: "creator.write", creatorId: px.creatorId }, "not_found");
    });
  });

  describe("rosters", () => {
    it("lets brand members manage their own roster only", async () => {
      expect((await as("sam", { type: "roster.manage", organizationId: org.juniper })).actingOrganizationId).toBe(org.juniper);
      await denied("blake", { type: "roster.manage", organizationId: org.juniper }, "not_found");
      await denied("maya", { type: "roster.manage", organizationId: org.maya }, "forbidden");
    });

    it("lets a brand change creators it added or shared demo creators, never another brand's", async () => {
      const [mine] = await db.insert(creator).values({ organizationId: org.juniper, displayName: "Added by Juniper", city: "", country: "" }).returning();
      await db.insert(brandCreator).values({ brandOrganizationId: org.juniper, creatorId: mine.id, source: "manual" });
      const [demo] = await db.insert(creator).values({ organizationId: org.dev, isDemo: true, displayName: "Demo", city: "Austin", country: "US" }).returning();
      await as("alex", { type: "roster.creator", organizationId: org.juniper, creatorId: mine.id });
      await as("alex", { type: "roster.creator", organizationId: org.juniper, creatorId: demo.id });
      await denied("blake", { type: "roster.creator", organizationId: org.otherBrand, creatorId: mine.id }, "not_found");
      await denied("alex", { type: "roster.creator", organizationId: org.juniper, creatorId: px.creatorId }, "not_found");
    });
  });
});
