import { describe, expect, it } from "vitest";
import { buildPackages, type PlanItem } from "./stages/budget";
import { bandFor, bestBand, hardConstraints, shortlistOrder, withoutKeys, type RosterEntry } from "./stages/cast";
import type { LoadedRun } from "./context";
import { convertCents, formatFee } from "./money";
import { withoutStatementKeys } from "./stages/fit";

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

  it("breaks ties with the team's preferred creators, never lifting them over past work; unpriced creators go last", () => {
    const x = (level: "strong" | "not assessed", preferred: boolean, cents: number | null) => ({ capability: { level, reason: null, portfolioItemIds: [] }, bands: {}, cheapestCents: cents, preferred });
    const sorted = [x("strong", false, 100), x("strong", false, null), x("strong", true, 900), x("not assessed", true, 50)].sort(shortlistOrder);
    expect(sorted.map((s) => [s.capability.level, s.preferred, s.cheapestCents])).toEqual([
      ["strong", true, 900],
      ["strong", false, 100],
      ["strong", false, null],
      ["not assessed", true, 50],
    ]);
  });
});

describe("hard constraints", () => {
  const run = { revision: { markets: ["US"], languages: ["en"], campaignType: "ugc_production", currency: "USD", budgetCents: 1_000_000 } } as unknown as LoadedRun;
  const entry = (over: { creator?: object; quotes?: object[]; link?: object | null } = {}) =>
    ({
      creator: { country: "US", languages: ["en"], modes: ["ugc_production"], availability: {}, declinedCategories: [], ...over.creator },
      quotes: over.quotes ?? [{ amountCents: 150_000, currency: "USD" }],
      link: over.link ?? null,
      portfolio: [],
      refs: [],
      themes: [],
    }) as unknown as RosterEntry;

  it("keeps a creator with no quote in the running as quote required", () => {
    expect(hardConstraints(entry({ quotes: [] }), run, "coffee")).toMatchObject({ passed: true, quoteRequired: true, cheapestCents: null });
  });

  it("rules out a quote over budget, and a creator the team excluded, with the reason", () => {
    expect(hardConstraints(entry({ quotes: [{ amountCents: 2_000_000, currency: "USD" }] }), run, "coffee").failures).toEqual(["Lowest quote exceeds the budget"]);
    expect(hardConstraints(entry({ link: { excluded: true, exclusionReason: "Works with a competitor" } }), run, "coffee").failures).toEqual([
      "Excluded by your team: Works with a competitor",
    ]);
  });

  it("treats fields a brand hasn't recorded as unknown, not failures", () => {
    expect(hardConstraints(entry({ creator: { country: "", languages: [], modes: [] } }), run, "coffee").passed).toBe(true);
    expect(hardConstraints(entry({ creator: { country: "GB" } }), run, "coffee").failures).toEqual(["Based outside the campaign markets (GB)"]);
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

  it("shows a missing price as quote required", () => {
    expect(formatFee({ amountCents: null, currency: "USD" })).toBe("Quote required");
    expect(formatFee({ amountCents: 150_000, currency: "USD" })).toBe("$1,500");
  });
});

describe("capability reasons", () => {
  it("drops creator and portfolio keys the model leaves in prose", () => {
    expect(withoutKeys("Hosting videos (P2, P3) show a warm counter style.")).toBe("Hosting videos show a warm counter style.");
    expect(withoutKeys("Kitchen work (P12) for C4 fits.")).toBe("Kitchen work for fits.");
    expect(withoutKeys("No relevant work.")).toBe("No relevant work.");
  });
});

describe("profile check notes", () => {
  it("drops statement keys the model leaves in prose", () => {
    expect(withoutStatementKeys("Customers host at weekends (K4), and hosting videos did well (K5, K6).")).toBe("Customers host at weekends, and hosting videos did well.");
    expect(withoutStatementKeys("As K2 says, speed wins.")).toBe("As the profile says, speed wins.");
    expect(withoutStatementKeys("K3's return to basics fits.")).toBe("the profile's return to basics fits.");
  });
});
