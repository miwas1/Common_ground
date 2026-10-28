import { describe, expect, it } from "vitest";
import { z } from "zod";
import { objectWithValidation, resolveModel, type Llm, type ObjectRequest } from "./index";

describe("model allowlist", () => {
  it("defaults to Sonnet 5.5 for standard steps and Haiku 5.5 for fast ones", () => {
    expect(resolveModel("standard", undefined)).toBe("claude-sonnet-5-5");
    expect(resolveModel("fast", "")).toBe("claude-haiku-5-5");
  });

  it("rejects any other model", () => {
    expect(() => resolveModel("standard", "claude-opus-5-5")).toThrow(/not allowed/);
    expect(() => resolveModel("fast", "claude-sonnet-5")).toThrow(/not allowed/);
  });
});

describe("validation retries", () => {
  it("resend the same prompt (the cached prefix) and put the problems in a follow-up block", async () => {
    const seen: ObjectRequest<z.ZodType>[] = [];
    const llm: Llm = {
      async object(req) {
        seen.push(req);
        return { n: seen.length } as never;
      },
    };
    const schema = z.object({ n: z.number() });
    const out = await objectWithValidation(llm, { name: "t", system: "S", prompt: "P", schema }, (v) => (v.n < 2 ? [{ path: "n", message: "too small" }] : []));
    expect(out).toEqual({ n: 2 });
    expect(seen.map((r) => r.prompt)).toEqual(["P", "P"]);
    expect(seen[0].followUp).toBeUndefined();
    expect(seen[1].followUp).toContain("too small");
  });
});
