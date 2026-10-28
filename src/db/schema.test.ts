// The database enforces the credibility and execution rules from PLAN.md §3.2 and §4.1,
// so a bug in application code cannot store an unsupported finding or a second active run.
import { beforeAll, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { campaign, campaignRevision, claim, claimBinding, evidence, run } from "@/db/schema";

describe("schema constraints", { timeout: 30_000 }, () => {
  let db: Db;
  let revisionId: string;
  let runId: string;

  beforeAll(async () => {
    db = await openPglite("memory://");
    const [c] = await db.insert(campaign).values({ name: "Constraints", organizationId: "org_test" }).returning();
    const [r] = await db
      .insert(campaignRevision)
      .values({
        campaignId: c.id,
        number: 1,
        brief: {},
        campaignType: "ugc_production",
        markets: ["US"],
        languages: ["en"],
        createdBy: "user_test",
      })
      .returning();
    revisionId = r.id;
    const [rn] = await db.insert(run).values({ revisionId, status: "running" }).returning();
    runId = rn.id;
  });

  it("allows only one active run per revision and mode", async () => {
    await expect(db.insert(run).values({ revisionId, status: "pending" })).rejects.toThrow();
    // a baseline run alongside is fine, and so is a new run once the first has finished
    await db.insert(run).values({ revisionId, mode: "baseline", status: "running" });
    await db.insert(run).values({ revisionId, status: "done" });
  });

  it("rejects a finding written by the model", async () => {
    await expect(
      db.insert(claim).values({
        runId,
        ownerType: "direction",
        ownerId: crypto.randomUUID(),
        kind: "finding",
        text: "Ranked highly",
        createdBy: "model",
      }),
    ).rejects.toThrow();
  });

  it("requires each binding to point at exactly one source", async () => {
    const [ev] = await db
      .insert(evidence)
      .values({ runId, kind: "entity", label: "Example podcast", values: { affinity: 0.9 }, rank: 3, resultCount: 10 })
      .returning();
    const [finding] = await db
      .insert(claim)
      .values({
        runId,
        ownerType: "direction",
        ownerId: crypto.randomUUID(),
        kind: "finding",
        text: "Ranked #3 of 10 podcasts for this profile",
        createdBy: "template",
      })
      .returning();

    await db.insert(claimBinding).values({ claimId: finding.id, evidenceId: ev.id, field: "rank" });
    await expect(db.insert(claimBinding).values({ claimId: finding.id, field: "rank" })).rejects.toThrow();
    await expect(
      db.insert(claimBinding).values({ claimId: finding.id, evidenceId: ev.id, findingClaimId: finding.id }),
    ).rejects.toThrow();
  });
});
