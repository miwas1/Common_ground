import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { member } from "@/db/auth-schema";
import { creator, creatorReference, creatorTheme, orgProfile, portfolioItem, quote } from "@/db/schema";
import { createAuth } from "@/lib/auth/create";
import type { QlooApi } from "@/lib/qloo/api";
import { DEMO_ACCOUNTS } from "./accounts";
import { ROSTER } from "./roster";
import { seedRoster } from "./roster-seed";
import { seedDemoIdentities } from "./seed";

// Offline stand-in for Qloo: every label resolves exactly, except the ones listed as unknown.
const UNKNOWN = new Set(["Khruangbin", "Coffee Culture"]);
const ok = <T>(data: T) => ({ status: "ok" as const, data, call: {} as never });
const fakeApi = {
  search: async ({ query, types }: { query: string; types: string[] }) =>
    ok(UNKNOWN.has(query) ? [] : [{ id: `E:${query}`, name: query, type: types[0], popularity: 0.95, tags: [] }]),
  findTags: async ({ query }: { query: string }) =>
    ok(UNKNOWN.has(query) ? [] : [{ id: `T:${query}`, name: query, subtype: "urn:tag:lifestyle:qloo", parentTypes: [] }]),
} as unknown as QlooApi;

describe("roster seed", { timeout: 60_000 }, () => {
  let db: Db;
  let demoCreatorUserId: string;

  beforeAll(async () => {
    db = await openPglite("memory://");
    const seeded = await seedDemoIdentities(db, createAuth(db), "demo-password-123");
    demoCreatorUserId = seeded.find((s) => s.role === "creator")!.userId;
  });

  it("creates every creator with portfolio, quotes, references and themes, and is idempotent", async () => {
    const first = await seedRoster(db, fakeApi);
    expect(first.created).toHaveLength(ROSTER.length);
    expect(ROSTER.length).toBeGreaterThanOrEqual(30);

    const second = await seedRoster(db, fakeApi);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(ROSTER.length);

    expect(await db.select().from(creator)).toHaveLength(ROSTER.length);
    const total = (k: "portfolio" | "quotes" | "references" | "themes") => ROSTER.reduce((n, c) => n + c[k].length, 0);
    expect(await db.select().from(portfolioItem)).toHaveLength(total("portfolio"));
    expect(await db.select().from(quote)).toHaveLength(total("quotes"));
    expect(await db.select().from(creatorReference)).toHaveLength(total("references"));
    expect(await db.select().from(creatorTheme)).toHaveLength(total("themes"));
  });

  it("only confirms resolved labels and reports the rest", async () => {
    const report = await seedRoster(db, fakeApi, []);
    expect(report.unresolved).toEqual([]);

    const refs = await db.select().from(creatorReference).where(eq(creatorReference.label, "Khruangbin"));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => !r.confirmed && r.qlooId === null)).toBe(true);
    const confirmed = await db.select().from(creatorReference).where(eq(creatorReference.label, "The Bear"));
    expect(confirmed.every((r) => r.confirmed && r.qlooId === "E:The Bear")).toBe(true);
  });

  it("attaches Maya to the demo creator login and keeps roster orgs memberless", async () => {
    const [maya] = await db.select().from(creator).where(eq(creator.displayName, "Maya L."));
    const memberships = await db.select().from(member).where(eq(member.organizationId, maya.organizationId));
    expect(memberships.map((m) => m.userId)).toEqual([demoCreatorUserId]);

    const [theo] = await db.select().from(creator).where(eq(creator.displayName, "Theo Okafor"));
    expect(await db.select().from(member).where(eq(member.organizationId, theo.organizationId))).toHaveLength(0);
    const [profile] = await db.select().from(orgProfile).where(eq(orgProfile.organizationId, theo.organizationId));
    expect(profile).toMatchObject({ kind: "creator", isDemo: true });
    expect(DEMO_ACCOUNTS.creator.user.name).toBe("Maya L.");
  });

  it("keeps follower data off production-only creators", async () => {
    const rows = await db.select().from(creator);
    for (const row of rows) {
      const def = ROSTER.find((c) => c.displayName === row.displayName)!;
      if (!def.modes.includes("creator_distribution")) expect(row.audienceStats).toBeNull();
      else expect(row.audienceStats).toMatchObject({ source: "self-reported" });
    }
  });
});
