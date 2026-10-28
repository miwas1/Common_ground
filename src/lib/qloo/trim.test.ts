// Synthetic fixtures shaped like Qloo responses. Real Qloo data must not be committed.
import { describe, expect, it } from "vitest";
import {
  trimCompare,
  trimDemographics,
  trimHeatmap,
  trimInsightsEntities,
  trimSearch,
  trimTags,
  trimTrending,
} from "./trim";

describe("trimInsightsEntities", () => {
  const raw = {
    success: true,
    results: {
      entities: [
        {
          name: "Example Artist",
          entity_id: "E1",
          type: "urn:entity",
          subtype: "urn:entity:artist",
          popularity: 0.91,
          properties: { image: { url: "https://img/1.jpg" }, description: "Long description", biography: "x".repeat(5000) },
          tags: Array.from({ length: 20 }, (_, i) => ({ id: `urn:tag:t${i}`, name: `Tag ${i}`, type: "urn:tag:genre" })),
          query: {
            affinity: 0.87,
            explainability: { "signal.interests.entities": [{ entity_id: "S1", score: 0.6 }, { entity_id: "S2", score: 0.4 }] },
          },
          external: { spotify: [{ id: "abc" }] },
        },
        { name: "No id" },
      ],
    },
    query: {
      explainability: {
        "signal.interests.entities": {
          effect_on_top3_recs: [{ entity_id: "S1", avg_score: 0.55 }],
          effect_on_top10_recs: [{ entity_id: "S1", avg_score: 0.5 }],
          effect_on_all_recs: [{ entity_id: "S1", avg_score: 0.45 }],
        },
      },
    },
  };

  it("keeps product fields and drops heavy ones", () => {
    const { entities, attribution } = trimInsightsEntities(raw);
    expect(entities).toHaveLength(1);
    const [e] = entities;
    expect(e).toMatchObject({ id: "E1", name: "Example Artist", type: "urn:entity:artist", affinity: 0.87, imageUrl: "https://img/1.jpg" });
    expect(e.tags).toHaveLength(8);
    expect(e.attribution).toEqual([
      { entityId: "S1", score: 0.6 },
      { entityId: "S2", score: 0.4 },
    ]);
    expect(JSON.stringify(e)).not.toContain("xxxxx");
    expect(attribution?.top3).toEqual([{ entityId: "S1", score: 0.55 }]);
  });

  it("returns empty for malformed input", () => {
    expect(trimInsightsEntities({})).toEqual({ entities: [] });
    expect(trimInsightsEntities(null)).toEqual({ entities: [] });
  });
});

it("trimSearch extracts place details", () => {
  const [place] = trimSearch({
    results: [
      {
        name: "Cafe",
        entity_id: "P1",
        types: ["urn:entity:place"],
        location: { lat: 51.5, lon: -0.12 },
        properties: { address: "1 Street", price_level: 2, business_rating: 4.3, geocode: { city: "London", country_code: "GB" } },
      },
    ],
  });
  expect(place.place).toMatchObject({ city: "London", country: "GB", lat: 51.5, priceLevel: 2 });
});

it("trimTags handles both /v2/tags and urn:tag insights shapes", () => {
  const fromSearch = trimTags({
    results: { tags: [{ id: "urn:tag:lifestyle:qloo:a", name: "A", type: "urn:tag:lifestyle:qloo", parents: [{ type: "urn:entity:brand" }] }] },
  });
  const fromInsights = trimTags({
    results: { tags: [{ tag_id: "urn:tag:lifestyle:qloo:b", name: "B", subtype: "urn:tag:lifestyle:qloo", types: ["urn:entity:brand"], query: { affinity: 0.97 } }] },
  });
  expect(fromSearch[0]).toMatchObject({ id: "urn:tag:lifestyle:qloo:a", subtype: "urn:tag:lifestyle:qloo", parentTypes: ["urn:entity:brand"] });
  expect(fromInsights[0]).toMatchObject({ id: "urn:tag:lifestyle:qloo:b", affinity: 0.97 });
});

it("trimDemographics rounds skews", () => {
  const [d] = trimDemographics({
    results: { demographics: [{ entity_id: "E1", query: { age: { "30_to_34": 0.30000000000000004 }, gender: { male: 0.16, female: -0.16 } } }] },
  });
  expect(d).toEqual({ subjectId: "E1", age: { "30_to_34": 0.3 }, gender: { male: 0.16, female: -0.16 } });
});

it("trimHeatmap drops incomplete cells", () => {
  const cells = trimHeatmap({
    results: {
      heatmap: [
        { location: { latitude: 1, longitude: 2, geohash: "abc" }, query: { affinity: 1, affinity_rank: 0.9, popularity: 0.5 } },
        { location: { latitude: 1 }, query: {} },
      ],
    },
  });
  expect(cells).toEqual([{ geohash: "abc", lat: 1, lon: 2, affinity: 1, affinityRank: 0.9, popularity: 0.5 }]);
});

it("trimTrending sorts oldest first and parses numeric strings", () => {
  const points = trimTrending({
    results: {
      trending: [
        { date: "2026-09-30", population_percentile: 0.7, population_rank: "10246" },
        { date: "2026-09-23", population_percentile: 0.6, population_rank: "11000" },
      ],
    },
  });
  expect(points.map((p) => p.date)).toEqual(["2026-09-23", "2026-09-30"]);
  expect(points[1].populationRank).toBe(10246);
});

it("trimCompare splits shared and distinctive tags", () => {
  const result = trimCompare({
    results: { tags: [], a: [{ tag_id: "t1", name: "Dining", query: { count: "1" } }], b: [{ tag_id: "t2", name: "Media" }] },
  });
  expect(result.onlyA[0]).toMatchObject({ id: "t1", count: 1 });
  expect(result.onlyB[0].name).toBe("Media");
  expect(result.shared).toEqual([]);
});
