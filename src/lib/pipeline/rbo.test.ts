import { describe, expect, it } from "vitest";
import { rbo } from "./rbo";
import { sensitivityFor } from "./stages/checks";

describe("rbo", () => {
  it("scores identical rankings 1 and disjoint rankings 0", () => {
    expect(rbo(["a", "b", "c"], ["a", "b", "c"])).toBeCloseTo(1);
    expect(rbo(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("penalises items that drop out, not just reordering", () => {
    const reordered = rbo(["a", "b", "c", "d"], ["b", "a", "c", "d"]);
    const dropped = rbo(["a", "b", "c", "d"], ["a", "c"]);
    expect(reordered).toBeGreaterThan(0.7);
    expect(dropped).toBeLessThan(reordered);
    expect(rbo(["a", "b"], ["a"])).toBeLessThan(1);
  });
});

describe("sensitivityFor", () => {
  const profile = { direction: {} as never, entities: [], tags: ["t1", "t2", "t3", "t4"].map((id) => ({ qlooId: id, label: id, evidenceId: id })) };
  const scores = (ids: string[]) => new Map(ids.map((id, i) => [id, 0.9 - i * 0.05]));

  it("calls a direction stable only when its concepts survive", () => {
    const res = sensitivityFor(profile, scores(["t1", "t2", "t3", "t4"]), [
      { label: "Khruangbin", source: "research", scores: scores(["t1", "t3"]) },
      { label: "Home Cooking", source: "assumption", scores: scores(["t1", "t2", "t4", "t3"]) },
    ]);
    expect(res.tested.map((t) => t.stable)).toEqual([false, true]);
    expect(res.tested[0].retained).toBe(0.5);
    expect(res.summary).toBe("Changes when Khruangbin is removed");
    expect(res.dependsOnAssumption).toBe(false);
  });

  it("flags dependence on an unconfirmed assumption and says when nothing was tested", () => {
    const res = sensitivityFor(profile, scores(["t1", "t2", "t3", "t4"]), [{ label: "Home Cooking", source: "assumption", scores: scores(["t1"]) }]);
    expect(res.dependsOnAssumption).toBe(true);
    expect(sensitivityFor(profile, new Map(), []).summary).toMatch(/^Not tested/);
  });
});

describe("isFlat", () => {
  it("treats near-identical affinities as carrying no ranking information", async () => {
    const { isFlat } = await import("./stages/checks");
    const tag = (affinity: number) => ({ id: String(affinity), name: "t", parentTypes: [], affinity });
    expect(isFlat([tag(0.5), tag(0.5), tag(0.505)])).toBe(true);
    expect(isFlat([tag(0.9), tag(0.6)])).toBe(false);
    expect(isFlat([tag(0.9)])).toBe(true);
  });
});
