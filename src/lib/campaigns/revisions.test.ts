// Refinement creates a new immutable revision (PLAN.md §4.4, §9): the parent stays intact,
// the user's inputs and choices are copied minus what was removed, and nothing derived is shared.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { briefInput, campaign, campaignRevision, resolvedReference, run } from "@/db/schema";
import { createCampaign, createOrg, createUser } from "@/test/fixtures";
import { deriveRevision, RevisionError } from "./revisions";

describe("deriveRevision", { timeout: 30_000 }, () => {
  let db: Db;
  let campaignId: string;
  let revisionId: string;
  let userId: string;
  const ids = { input: "", band: "", show: "", tag: "" };

  beforeEach(async () => {
    db = await openPglite("memory://");
    userId = await createUser(db);
    const organizationId = await createOrg(db, { kind: "brand", members: [{ userId }] });
    ({ campaignId, revisionId } = await createCampaign(db, { organizationId, userId }));
    await db.update(campaign).set({ currentRevisionId: revisionId }).where(eq(campaign.id, campaignId));
    await db.update(campaignRevision).set({ budgetCents: 1_200_000 }).where(eq(campaignRevision.id, revisionId));
    const [input] = await db.insert(briefInput).values({ revisionId, text: "They host friends at home", source: "assumption" }).returning();
    const refs = await db
      .insert(resolvedReference)
      .values([
        { revisionId, label: "Khruangbin", qlooKind: "entity", qlooId: "E1", qlooType: "urn:entity:artist", status: "confirmed" },
        { revisionId, label: "The Bear", qlooKind: "entity", qlooId: "E2", qlooType: "urn:entity:tv_show", status: "confirmed" },
        { revisionId, briefInputId: input.id, label: "Hosting", qlooKind: "tag", qlooId: "T1", status: "confirmed" },
        { revisionId, label: "Juniper Coffee", qlooKind: "entity", status: "rejected" },
      ])
      .returning();
    ids.input = input.id;
    [ids.band, ids.show, ids.tag] = refs.map((r) => r.id);
    await db.insert(run).values({ revisionId, status: "done" });
  });

  const refsOf = async (rev: string) =>
    (await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, rev))).map((r) => `${r.label}:${r.status}`).sort();

  it("removing a reference makes a numbered child revision and leaves the parent untouched", async () => {
    const { revisionId: child, changeNote } = await deriveRevision(db, campaignId, { type: "remove_reference", referenceId: ids.band }, userId);
    const [rev] = await db.select().from(campaignRevision).where(eq(campaignRevision.id, child));
    expect(rev).toMatchObject({ number: 2, parentRevisionId: revisionId, budgetCents: 1_200_000, createdBy: userId });
    expect(changeNote).toBe("Removed “Khruangbin”");
    expect(await refsOf(child)).toEqual(["Hosting:confirmed", "Juniper Coffee:rejected", "The Bear:confirmed"]);
    expect(await refsOf(revisionId)).toEqual(["Hosting:confirmed", "Juniper Coffee:rejected", "Khruangbin:confirmed", "The Bear:confirmed"]);
    // Nothing derived carries over: the child has no runs until research starts.
    expect(await db.select().from(run).where(eq(run.revisionId, child))).toEqual([]);
  });

  it("removing an audience input also removes the references that came from it", async () => {
    const { revisionId: child } = await deriveRevision(db, campaignId, { type: "remove_input", inputId: ids.input }, userId);
    expect(await db.select().from(briefInput).where(eq(briefInput.revisionId, child))).toEqual([]);
    expect(await refsOf(child)).toEqual(["Juniper Coffee:rejected", "Khruangbin:confirmed", "The Bear:confirmed"]);
  });

  it("re-points copied references at the copied inputs", async () => {
    const { revisionId: child } = await deriveRevision(db, campaignId, { type: "set_budget", budgetCents: 800_000 }, userId);
    const [input] = await db.select().from(briefInput).where(eq(briefInput.revisionId, child));
    const [tag] = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, child)).then((r) => r.filter((x) => x.label === "Hosting"));
    expect(tag.briefInputId).toBe(input.id);
    const [rev] = await db.select().from(campaignRevision).where(eq(campaignRevision.id, child));
    expect(rev.budgetCents).toBe(800_000);
  });

  it("refuses while research is running, and refuses to remove the last confirmed reference", async () => {
    const [active] = await db.insert(run).values({ revisionId, status: "running" }).returning();
    await expect(deriveRevision(db, campaignId, { type: "remove_reference", referenceId: ids.band }, userId)).rejects.toThrow(RevisionError);
    await db.update(run).set({ status: "done" }).where(eq(run.id, active.id));

    await db.delete(resolvedReference).where(eq(resolvedReference.id, ids.show));
    await db.delete(resolvedReference).where(eq(resolvedReference.id, ids.tag));
    await expect(deriveRevision(db, campaignId, { type: "remove_reference", referenceId: ids.band }, userId)).rejects.toThrow("at least one");
  });
});
