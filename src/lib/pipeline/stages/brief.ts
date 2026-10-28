// Stage 1 — parse the brief into structured fields and candidate public references.

import { z } from "zod";
import { checkClaims, type Issue } from "@/lib/claims/validate";
import { objectWithValidation } from "@/lib/llm";
import { loadRun, type StageCtx } from "../context";

/** A failure retrying will not fix (bad input, model refusal); the run stops with this message. */
export class StageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageInputError";
  }
}

export const AGE_BANDS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export const REFERENCE_KINDS = ["brand", "artist", "tv_show", "movie", "podcast", "book", "interest", "audience_segment"] as const;

export const ParsedBrief = z.object({
  productCategory: z.string().describe("Plain product category, e.g. 'coffee concentrate'"),
  objectiveSummary: z.string(),
  references: z
    .array(
      z.object({
        label: z.string().describe("Canonical public name (brand, artist, show, film, podcast, book) or a short interest/segment phrase"),
        kind: z.enum(REFERENCE_KINDS),
        inputIndex: z.number().nullable().describe("Index of the audience input it came from, or null if from the notes"),
        rationale: z.string(),
      }),
    )
    .describe("Public cultural references and interests stated or clearly implied by the brief"),
  intendedAudience: z.object({
    ageBands: z.array(z.enum(AGE_BANDS)),
    gender: z.enum(["any", "male", "female"]),
    summary: z.string(),
  }),
  deliverables: z.array(z.object({ format: z.string(), count: z.number() })),
  constraints: z.array(z.string()),
  missing: z.array(z.string()).describe("Information the team has not provided, phrased as practical gaps"),
});
export type ParsedBrief = z.infer<typeof ParsedBrief>;

const SYSTEM = `You turn a brand's campaign brief into structured fields for a creative strategy tool.
Extract only what the brief states or clearly implies; never invent customer research.
For references, list public cultural entities a taste graph could know — the brand's competitors and peers, artists, TV shows, films, podcasts, books — plus short interest phrases (e.g. "home cooking", "urban cycling") and audience segments (e.g. "coffee"). Use each entity's canonical public name. Do not include the brand itself; it is added separately.`;

export async function parseBrief(ctx: StageCtx) {
  const { brief, inputs, revision } = await loadRun(ctx.db, ctx.runId);
  const inputLines = inputs.map((i, n) => `[${n}] (${i.source}) ${i.text}`).join("\n") || "(none provided)";

  const prompt = `<brief>
Brand: ${brief.brandName}
Product: ${brief.product.name} — ${brief.product.description}
Objective: ${brief.objective}
Campaign type: ${revision.campaignType}
Markets: ${revision.markets.join(", ")}; languages: ${revision.languages.join(", ")}
Budget: ${revision.budgetCents ? `${revision.budgetCents / 100} ${revision.currency}` : "not given"}
Deliverables requested: ${brief.deliverables || "not given"}
Constraints: ${brief.constraints || "none given"}
Team notes: ${brief.notes || "none"}
</brief>
<audience_inputs>
${inputLines}
</audience_inputs>
Return the structured brief. Keep references to the ones the brief supports (at most 10).`;

  const parsed = await objectWithValidation(
    ctx.llm,
    { name: "parse brief", system: SYSTEM, prompt, schema: ParsedBrief, effort: "low" },
    (v) => {
      const issues: Issue[] = [];
      if (v.references.length > 10) issues.push({ path: "references", message: "at most 10 references" });
      v.references.forEach((r, i) => {
        if (r.inputIndex !== null && (r.inputIndex < 0 || r.inputIndex >= inputs.length)) {
          issues.push({ path: `references[${i}].inputIndex`, message: `must be null or between 0 and ${inputs.length - 1}` });
        }
        issues.push(...checkClaims(r.rationale, `references[${i}].rationale`));
      });
      return issues;
    },
  );
  return parsed;
}
