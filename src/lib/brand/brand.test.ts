import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { Llm, ObjectRequest } from "@/lib/llm";
import { EXAMPLE_RESEARCH_TEXT } from "@/lib/demo/example-research";
import { extractStatements, normalizeText, pageOf } from "./extract";

describe("brand documents", () => {
  it("compares passages ignoring case, curly quotes, dashes and spacing", () => {
    expect(normalizeText("“Good”  coffee — fast")).toBe('"good" coffee - fast');
  });

  it("finds a passage's page from the page markers before it", () => {
    expect(pageOf(EXAMPLE_RESEARCH_TEXT, "Convenience came up more than anything else.")).toBe(1);
    expect(pageOf(EXAMPLE_RESEARCH_TEXT, "hosting videos had a higher hook rate")).toBe(2);
    expect(pageOf("no markers here", "markers")).toBeNull();
    expect(pageOf(EXAMPLE_RESEARCH_TEXT, "not in the document at all")).toBeNull();
  });

  it("keeps only statements whose quote is really in the document, asking once more for the rest", async () => {
    const calls: (string | undefined)[] = [];
    const llm: Llm = {
      async object<S extends z.ZodType>(req: ObjectRequest<S>): Promise<z.infer<S>> {
        calls.push(req.followUp);
        return {
          statements: [
            { kind: "research", text: "Convenience matters most.", quote: "Convenience came up more than anything else." },
            { kind: "research", text: "Customers love craft.", quote: "Customers told us they love hand-roasted beans." },
          ],
        } as z.infer<S>;
      },
    };
    const out = await extractStatements(llm, { name: "Interviews", text: EXAMPLE_RESEARCH_TEXT });
    expect(out.statements).toEqual([{ kind: "research", text: "Convenience matters most.", quote: "Convenience came up more than anything else.", page: 1 }]);
    expect(out.dropped).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("hand-roasted beans");
  });
});
