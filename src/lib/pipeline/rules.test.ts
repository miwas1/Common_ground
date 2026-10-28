import { describe, expect, it } from "vitest";
import { buildPackages, type PlanItem } from "./stages/budget";
import { bandFor, bestBand, shortlistOrder } from "./stages/cast";
import { convertCents } from "./money";

describe("cultural bands", () => {
  const positions = new Map([["a", 0], ["b", 5], ["c", 9]]);

  it("bands by position within one query", () => {
    expect(bandFor(0, 10)).toBe("top quarter");
    expect(bandFor(5, 10)).toBe("middle");
    expect(bandFor(9, 10)).toBe("lower");
  });

  it("uses the best reference, so listing more references never helps", () => {
    const one = bestBand([{ id: "b", label: "B" }], positions, 10);
    const more = bestBand([{ id: "b", label: "B" }, { id: "c", label: "C" }, { id: "zz", label: "Unknown" }], positions, 10);
    expect(more.band).toBe(one.band);
    expect(more).toMatchObject({ best: "B", measured: 2, of: 3 });
  });

  it("treats unreturned references as not measured, not zero", () => {
    expect(bestBand([{ id: "zz", label: "Z" }], positions, 10)).toEqual({ band: "not measured", best: null, measured: 0, of: 1 });
  });

  it("orders the shortlist by capability, then bands, then price", () => {
    const x = (level: "strong" | "partial", top: number, cents: number) => ({
      capability: { level, reason: null, portfolioItemIds: [] },
      bands: Object.fromEntries(Array.from({ length: top }, (_, i) => [`t${i}`, { band: "top quarter" as const, best: "x", measured: 1, of: 1 }])),
      cheapestCents: cents,
    });
    const sorted = [x("partial", 3, 100), x("strong", 0, 500), x("strong", 1, 900), x("strong", 1, 200)].sort(shortlistOrder);
    expect(sorted.map((s) => [s.capability.level, s.cheapestCents])).toEqual([["strong", 200], ["strong", 900], ["strong", 500], ["partial", 100]]);
  });
});

describe("budget packages", () => {
  const item = (id: string, dir: string, cost: number, extra: Partial<PlanItem> = {}): PlanItem => ({
    proposalId: id,
    directionId: dir,
    directionTitle: `Direction ${dir}`,
    creatorName: id,
    costCents: cost,
    capability: "strong",
    distribution: false,
    production: true,
    ...extra,
  });
  const items = [item("p1", "A", 140_000), item("p2", "A", 180_000), item("p3", "B", 120_000), item("p4", "C", 900_000, { capability: "partial" }), item("d1", "B", 320_000, { distribution: true, production: false })];

  it("never exceeds the budget and offers distinct packages", () => {
    const pkgs = buildPackages(items, 1_000_000, "USD", "hybrid");
    expect(pkgs.length).toBeGreaterThanOrEqual(3);
    for (const p of pkgs) expect(p.costCents).toBeLessThanOrEqual(1_000_000);
    const sets = pkgs.map((p) => p.items.map((i) => i.proposalId).sort().join());
    expect(new Set(sets).size).toBe(sets.length);
    expect(pkgs.find((p) => p.kind === "hybrid")!.items[0].proposalId).toBe("d1");
  });

  it("skips the hybrid package for production-only campaigns", () => {
    expect(buildPackages(items, 1_000_000, "USD", "ugc_production").some((p) => p.kind === "hybrid")).toBe(false);
  });
});

describe("money", () => {
  it("converts with indicative rates", () => {
    expect(convertCents(100_000, "GBP", "USD")).toBe(127_000);
    expect(convertCents(127_000, "USD", "GBP")).toBe(100_000);
    expect(() => convertCents(1, "JPY", "USD")).toThrow();
  });
});
