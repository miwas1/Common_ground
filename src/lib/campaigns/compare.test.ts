import { describe, expect, it } from "vitest";
import { diffNames, matchDirections } from "./compare";

const d = (id: string, anchors: string[]) => ({ id, anchors: new Set(anchors) });

describe("revision compare", () => {
  it("matches directions by shared anchors, not by order", () => {
    const res = matchDirections(
      [d("a1", ["t1", "t2", "t3"]), d("a2", ["t4", "t5"])],
      [d("b1", ["t4", "t5", "t6"]), d("b2", ["t1", "t2"])],
    );
    expect(res.matches.map((m) => [m.a, m.b])).toEqual([["a1", "b2"], ["a2", "b1"]]);
    expect(res.dropped).toEqual([]);
    expect(res.added).toEqual([]);
  });

  it("pairs each direction at most once and reports the rest as dropped or new", () => {
    const res = matchDirections([d("a1", ["t1", "t2"]), d("a2", ["t1", "t2", "t9"])], [d("b1", ["t1", "t2"]), d("b2", ["x", "y"])]);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]).toMatchObject({ a: "a1", b: "b1", shared: 2, similarity: 1 });
    expect(res.dropped).toEqual(["a2"]);
    expect(res.added).toEqual(["b2"]);
  });

  it("does not match directions below the overlap threshold", () => {
    const res = matchDirections([d("a1", ["t1", "t2", "t3", "t4", "t5", "t6"])], [d("b1", ["t1", "u2", "u3", "u4", "u5", "u6"])]);
    expect(res.matches).toEqual([]);
  });

  it("diffs names", () => {
    expect(diffNames(["A", "B"], ["B", "C"])).toEqual({ removed: ["A"], added: ["C"], kept: ["B"] });
  });
});
