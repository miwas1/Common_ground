import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { openPglite, type Db } from "@/db";
import { campaign, qlooCall } from "@/db/schema";
import { createOrg } from "@/test/fixtures";
import { QlooClient } from "./client";
import { DbCache, recordCall } from "./db-cache";

describe("Qloo cache and provenance on PGlite", { timeout: 30_000 }, () => {
  let db: Db;
  let organizationId: string;

  beforeAll(async () => {
    db = await openPglite("memory://");
    organizationId = await createOrg(db, { kind: "brand" });
  });

  it("applies migrations", async () => {
    const [row] = await db.insert(campaign).values({ name: "Test", organizationId }).returning();
    expect(row.status).toBe("brief_draft");
  });

  it("round-trips and overwrites cached responses", async () => {
    const cache = new DbCache(db);
    expect(await cache.get("k")).toBeUndefined();
    await cache.set("k", { entities: [{ id: "E1" }] });
    expect(await cache.get("k")).toEqual({ entities: [{ id: "E1" }] });
    await cache.set("k", { entities: [] });
    expect(await cache.get("k")).toEqual({ entities: [] });
  });

  it("serves repeat calls from the database and logs every call against the campaign", async () => {
    const [c] = await db.insert(campaign).values({ name: "Provenance", organizationId }).returning();
    const fetchImpl = vi.fn(async () => Response.json({ results: [1, 2] }));
    const client = new QlooClient({
      apiKey: "k".repeat(12),
      baseUrl: "https://q.test",
      fetchImpl,
      cache: new DbCache(Promise.resolve(db)),
      onCall: recordCall(db, c.id),
    });
    const trim = (raw: unknown) => (raw as { results: number[] }).results;
    const isEmpty = (d: number[]) => d.length === 0;

    await client.get("/search", { query: "coffee" }, trim, isEmpty);
    const second = await client.get("/search", { query: "coffee" }, trim, isEmpty);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ status: "ok", data: [1, 2] });

    const calls = await db.select().from(qlooCall).where(eq(qlooCall.campaignId, c.id));
    expect(calls.map((r) => r.cached).sort()).toEqual([false, true]);
    expect(calls[0]).toMatchObject({ endpoint: "/search", params: { query: "coffee" }, status: "ok" });
  });
});
