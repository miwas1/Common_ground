import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MODEL, objectWithValidation, type Llm, type ObjectRequest } from "./index";

describe("model", () => {
  it("is Haiku 5.5 for every step", () => {
    expect(MODEL).toBe("claude-haiku-5-5");
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
