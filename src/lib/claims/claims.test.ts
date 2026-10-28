import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { claim, claimBinding, evidence, run } from "@/db/schema";
import { createCampaign, createOrg } from "@/test/fixtures";
import { renderFinding } from "./findings";
import { attachFindings, attachInterpretation } from "./persist";
import { checkClaims, checkInterpretation, checkKeys } from "./validate";

describe("finding templates", () => {
  const ctx = { query: "taste" as const, profile: ["Juniper Coffee", "Khruangbin"], resultLabel: "lifestyle concepts" };

  it("states rank, scope and affinity for a tag", () => {
    const f = renderFinding({ kind: "tag", label: "Slow Living", rank: 1, resultCount: 15, values: { affinity: 0.9737, context: ctx } });
    expect(f.text).toBe(
      "“Slow Living” ranked #1 of 15 lifestyle concepts associated with Juniper Coffee + Khruangbin (affinity 0.97, comparable only within this query).",
    );
    expect(f.field).toBe("rank");
  });

  it("names the strongest contributing input only when there were several", () => {
    const base = { kind: "entity" as const, label: "Rhye", rank: 2, resultCount: 8 };
    const one = renderFinding({ ...base, values: { entityType: "urn:entity:artist", affinity: 0.87, attribution: [{ label: "X", score: 1 }], context: { ...ctx, query: "recommend", resultLabel: "music artists" } } });
    expect(one.text).not.toContain("contributing");
    const two = renderFinding({
      ...base,
      values: { entityType: "urn:entity:artist", affinity: 0.87, attribution: [{ label: "Khruangbin", score: 0.41 }, { label: "Juniper Coffee", score: 0.33 }], context: { ...ctx, query: "recommend", resultLabel: "music artists" } },
    });
    expect(two.text).toContain("the input contributing most was Khruangbin (0.41)");
  });

  it("describes demographic skew as aggregate and relative", () => {
    const f = renderFinding({
      kind: "demographic",
      label: "Blue Bottle Coffee",
      rank: null,
      resultCount: null,
      values: { age: { "30_to_34": 0.3, "35_to_44": 0.2, "45_to_54": -0.56, "25_to_29": -0.28 }, gender: { male: 0.16, female: -0.16 }, context: { query: "demographics", profile: [] } },
    });
    expect(f.text).toContain("over-indexes on ages 30–34 (+0.30) and 35–44 (+0.20)");
    expect(f.text).toContain("under-indexes on 45–54 (−0.56)");
    expect(f.text).toContain("gender skew male +0.16");
    expect(f.text).toContain("not individuals");
  });
});

describe("interpretation rules", () => {
  it("accepts a hedged, number-free reading", () => {
    expect(checkInterpretation("A conversational cooking format could be worth testing with this audience.", "i")).toEqual([]);
  });

  it.each([
    ["Slow living scored 97% here, so lean in.", "number"],
    ["This is the strongest direction for the brand.", "superlative"],
    ["Fans of this world will buy the concentrate.", "purchasing"],
    ["Expect higher conversion from this direction.", "performance"],
    ["This proves the audience wants calm mornings.", "proof"],
    ["Her followers love minimalist kitchens.", "followers"],
  ])("rejects %s", (text, kind) => {
    const issues = checkInterpretation(text, "i");
    expect(issues.length, kind).toBeGreaterThan(0);
  });

  it("lets creative copy use numbers but not forbidden claims", () => {
    expect(checkClaims("6am, three cups, one quiet street.", "hook")).toEqual([]);
    expect(checkClaims("Guaranteed to convert morning people.", "hook").length).toBeGreaterThan(0);
  });

  it("rejects unknown or missing citations", () => {
    const allowed = new Set(["E1", "E2"]);
    expect(checkKeys(["E1"], allowed, "d")).toEqual([]);
    expect(checkKeys([], allowed, "d")[0].message).toContain("at least 1");
    expect(checkKeys(["E9"], allowed, "d")[0].message).toContain("E9");
  });
});

describe("claim persistence", { timeout: 60_000 }, () => {
  let db: Db;
  let runId: string;
  let otherRunId: string;
  let evidenceId: string;
  let foreignEvidenceId: string;

  beforeAll(async () => {
    db = await openPglite("memory://");
    const organizationId = await createOrg(db, { kind: "brand" });
    const { revisionId } = await createCampaign(db, { organizationId });
    [{ id: runId }] = await db.insert(run).values({ revisionId, status: "running" }).returning();
    [{ id: otherRunId }] = await db.insert(run).values({ revisionId, mode: "baseline", status: "running" }).returning();
    const values = { affinity: 0.97, context: { query: "taste", profile: ["Juniper Coffee"], resultLabel: "lifestyle concepts" } };
    [{ id: evidenceId }] = await db.insert(evidence).values({ runId, kind: "tag", label: "Slow Living", values, rank: 1, resultCount: 15 }).returning();
    [{ id: foreignEvidenceId }] = await db.insert(evidence).values({ runId: otherRunId, kind: "tag", label: "Other", values, rank: 2, resultCount: 15 }).returning();
  });

  it("renders findings from evidence and binds interpretations to them", async () => {
    const owner = { type: "direction" as const, id: crypto.randomUUID() };
    const findings = await attachFindings(db, runId, owner, [evidenceId]);
    const findingId = findings.get(evidenceId)!;
    const interpretationId = await attachInterpretation(db, runId, owner, "Calm, unhurried rituals could anchor this direction.", [findingId]);

    const [f] = await db.select().from(claim).where(eq(claim.id, findingId));
    expect(f).toMatchObject({ kind: "finding", createdBy: "template" });
    expect(f.text).toContain("“Slow Living” ranked #1 of 15");
    const [b] = await db.select().from(claimBinding).where(eq(claimBinding.claimId, interpretationId));
    expect(b.findingClaimId).toBe(findingId);
  });

  it("refuses evidence from another run", async () => {
    await expect(attachFindings(db, runId, { type: "direction", id: crypto.randomUUID() }, [foreignEvidenceId])).rejects.toThrow(/outside this run/);
  });

  it("refuses an interpretation without findings", async () => {
    await expect(attachInterpretation(db, runId, { type: "direction", id: crypto.randomUUID() }, "x", [])).rejects.toThrow();
  });
});
