import { describe, expect, it, vi } from "vitest";
import { MemoryCache, QlooClient, encodeParams, type QlooCallRecord } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const identity = (raw: unknown) => raw as { n?: number };
const never = () => false;

describe("encodeParams", () => {
  it("joins arrays, stringifies scalars, drops empties, sorts keys", () => {
    expect(
      encodeParams({ z: 1, a: ["x", "y"], b: true, c: undefined, d: null, e: [] }),
    ).toEqual({ a: "x,y", b: "true", z: "1" });
  });
});

describe("QlooClient", () => {
  it("sends the key as X-Api-Key, never in the URL or provenance", async () => {
    const fetchImpl = vi.fn(async () => json({ n: 1 }));
    const calls: QlooCallRecord[] = [];
    const client = new QlooClient({ apiKey: "secret-key-123", baseUrl: "https://q.test/", fetchImpl, onCall: (c) => { calls.push(c); } });

    const result = await client.get("/v2/insights", { "filter.type": "urn:entity:movie" }, identity, never);

    expect(result.status).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://q.test/v2/insights?filter.type=urn%3Aentity%3Amovie");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret-key-123");
    expect(JSON.stringify(calls)).not.toContain("secret-key-123");
  });

  it("serves the second identical request from cache", async () => {
    const fetchImpl = vi.fn(async () => json({ n: 2 }));
    const client = new QlooClient({ apiKey: "k".repeat(12), baseUrl: "https://q.test", fetchImpl, cache: new MemoryCache() });

    await client.get("/search", { query: "x" }, identity, never);
    const second = await client.get("/search", { query: "x" }, identity, never);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.call.cached).toBe(true);
    expect(second.data).toEqual({ n: 2 });
  });

  it("retries retryable errors, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ n: 3 }));
    const client = new QlooClient({ apiKey: "k".repeat(12), baseUrl: "https://q.test", fetchImpl });

    const result = await client.get("/search", {}, identity, never);
    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry auth errors and does not cache failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key", { status: 401 }));
    const cache = new MemoryCache();
    const client = new QlooClient({ apiKey: "k".repeat(12), baseUrl: "https://q.test", fetchImpl, cache });

    const result = await client.get("/search", { query: "x" }, identity, never);
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.error.code).toBe("QLOO_AUTH");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await cache.get(result.call.cacheKey)).toBeUndefined();
  });

  it("reports empty results distinctly from errors", async () => {
    const client = new QlooClient({
      apiKey: "k".repeat(12),
      baseUrl: "https://q.test",
      fetchImpl: async () => json({ results: [] }),
    });
    const result = await client.get("/search", {}, (r) => (r as { results: unknown[] }).results, (d) => d.length === 0);
    expect(result.status).toBe("empty");
  });
});
