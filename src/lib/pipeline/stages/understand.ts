// Stage 0 — understand the request before anything is looked up: what the brand sells, what the
// brief's shorthand means, who the peers are. Live web search supplies background a brief leaves out
// (an unfamiliar brand, a niche category). This is context for reading the brief only: it never
// becomes evidence, and nothing downstream may cite it; findings still come from Qloo alone.

import { z } from "zod";
import type { ResearchResult } from "@/lib/llm";
import { loadRun, type LoadedRun, type StageCtx } from "../context";

export const Understanding = z.object({
  summary: z.string().describe("Two or three plain sentences: what the brand sells, to whom, and what this campaign is for"),
  terms: z
    .array(z.object({ term: z.string(), meaning: z.string() }))
    .describe("Shorthand or jargon in the brief and what it means here, e.g. 'forex' → 'foreign-exchange currency trading'"),
  peers: z.array(z.string()).describe("Well-known competitor or peer brands in the same category, by canonical public name"),
  cautions: z.array(z.string()).describe("Rules or sensitivities a campaign in this category must respect"),
  talent: z
    .array(z.string())
    .describe("Up to 8 kinds of people brands in this category partner with, as snake_case occupation words, e.g. chef, food_stylist, barista for coffee; marathon_runner, triathlete for running shoes"),
});
export type Understanding = z.infer<typeof Understanding>;

export type UnderstandOutput = Understanding & { sources: ResearchResult["sources"]; searched: boolean };

const RESEARCH_SYSTEM = `You research the background a creative strategist needs before planning a creator campaign.
Search the web to learn what the brand and product are, the category they sit in, the brand's main competitors, and anything a campaign in this category must be careful about (regulation, age limits).
Report plainly what you found. Say when you could not find something rather than guessing. Do not describe or profile individual people.`;

const SYSTEM = `You read a brand's campaign brief and say, in plain words, what is actually being asked.
Read shorthand the way the brand team meant it: "forex, crypto traders" in a brief for a trading product means people who trade currencies and cryptocurrency.
Use the background research to fill in what the brand and its category are. Background is context only; never present it as customer research.`;

export function briefText({ brief, inputs, revision }: Pick<LoadedRun, "brief" | "inputs" | "revision">) {
  return `Brand: ${brief.brandName}
Product: ${brief.product.name} — ${brief.product.description}
Objective: ${brief.objective}
Markets: ${revision.markets.join(", ")}
Deliverables requested: ${brief.deliverables || "not given"}
Constraints: ${brief.constraints || "none given"}
Team notes: ${brief.notes || "none"}
Audience inputs:
${inputs.map((i) => `- (${i.source}) ${i.text}`).join("\n") || "- none"}`;
}

export async function understandBrief(ctx: StageCtx): Promise<UnderstandOutput> {
  const loaded = await loadRun(ctx.db, ctx.runId);
  const brief = briefText(loaded);

  // Web search is best-effort: an outage or a disabled tool leaves the step working from the brief alone.
  let research: ResearchResult | null = null;
  if (ctx.llm.research) {
    try {
      research = await ctx.llm.research({
        name: "brief background",
        system: RESEARCH_SYSTEM,
        prompt: `<brief>\n${brief}\n</brief>\nResearch the background for this brief. Keep the report under 300 words.`,
      });
    } catch (err) {
      console.warn(`brief background: web research skipped (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const understanding = await ctx.llm.object({
    name: "understand brief",
    system: SYSTEM,
    prompt: `<brief>\n${brief}\n</brief>\n<background_research>\n${research?.text || "(none available)"}\n</background_research>\nSay what this brief is asking for.`,
    schema: Understanding,
    effort: "low",
  });
  return { ...understanding, sources: research?.sources ?? [], searched: Boolean(research?.text) };
}
