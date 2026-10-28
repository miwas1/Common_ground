// Contract tests against the live hackathon API. Run with `pnpm test:live`.
// They catch data drift in the inputs our showcase depends on before judges do.
import { config } from "dotenv";
import { beforeAll, describe, expect, it } from "vitest";
import { QlooApi } from "./api";
import { MemoryCache, QlooClient } from "./client";

config({ path: ".env.local" });
const apiKey = process.env.QLOO_API_KEY;

describe.skipIf(!apiKey)("Qloo live contract", { timeout: 60_000 }, () => {
  const api = new QlooApi(
    new QlooClient({
      apiKey: apiKey ?? "",
      baseUrl: process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com",
      cache: new MemoryCache(),
    }),
  );
  let brandId = "";

  beforeAll(async () => {
    const res = await api.search({ query: "Blue Bottle Coffee", types: ["urn:entity:brand"] });
    expect(res.status).toBe("ok");
    brandId = res.data.find((e) => e.name === "Blue Bottle Coffee")?.id ?? "";
    expect(brandId).not.toBe("");
  });

  it("resolves concepts to tags and audiences", async () => {
    const tags = await api.findTags({ query: "home cooking" });
    expect(tags.data.some((t) => t.id.startsWith("urn:tag:"))).toBe(true);
    const audiences = await api.findAudiences({ query: "coffee" });
    expect(audiences.data.some((a) => a.id.startsWith("urn:audience:"))).toBe(true);
  });

  it("lists brand tag namespaces including lifestyle", async () => {
    const res = await api.tagTypes(["urn:entity:brand"]);
    expect(res.data).toContain("urn:tag:lifestyle:qloo");
  });

  it("returns a lifestyle taste profile for the brand", async () => {
    const res = await api.tasteProfile({ signals: { entities: [brandId] }, tagTypes: ["urn:tag:lifestyle:qloo"] });
    expect(res.status).toBe("ok");
    expect(res.data.length).toBeGreaterThan(5);
    expect(res.data[0].affinity).toBeGreaterThan(0.5);
  });

  it("recommends cross-domain entities with attribution across multiple seeds", async () => {
    const seed = await api.search({ query: "Khruangbin", types: ["urn:entity:artist"], take: 1 });
    const res = await api.recommend({
      type: "urn:entity:podcast",
      signals: { entities: [brandId, seed.data[0].id] },
      take: 5,
    });
    expect(res.status).toBe("ok");
    expect(res.data.entities[0].attribution?.length).toBe(2);
    expect(res.data.attribution?.all.length).toBe(2);
  });

  it("scores a given entity list against a profile", async () => {
    const kinfolk = await api.search({ query: "Kinfolk", types: ["urn:entity:brand"], take: 1 });
    const res = await api.scoreEntities({
      type: "urn:entity:brand",
      signals: { entities: [brandId] },
      entityIds: [kinfolk.data[0].id],
    });
    expect(res.data.entities[0]?.affinity).toBeGreaterThan(0);
  });

  it("returns demographics, a heatmap, local places and a comparison", async () => {
    const [demo, heat, places, compare] = await Promise.all([
      api.demographics({ entities: [brandId] }),
      api.heatmap({ area: "London", signals: { entities: [brandId] } }),
      api.recommend({ type: "urn:entity:place", signals: { entities: [brandId] }, inLocation: "London", take: 5, explain: false }),
      api.search({ query: "Kinfolk", types: ["urn:entity:brand"], take: 1 }).then((k) =>
        api.compare({ groupA: [brandId], groupB: [k.data[0].id] }),
      ),
    ]);
    expect(demo.data[0].subjectId).toBe(brandId);
    expect(heat.data.length).toBeGreaterThan(50);
    expect(places.data.entities[0].place?.lat).toBeTypeOf("number");
    expect(compare.status).toBe("ok");
  });
});
