// Stage 11 — does each direction fit what the brand already knows? Qloo suggests cultural directions;
// the brand's own research, results and rules (its approved profile) can agree with them or pull
// against them, and both should stay visible: interviews saying convenience beats craftsmanship
// don't disappear because Qloo found a strong craft-oriented world. The model reads each direction
// against the approved statements and must cite them; its reading is labelled as interpretation.
// A brand with no approved profile gets no check, not a guess.

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { brandDocument, brandFact } from "@/db/schema";
import { checkClaims, checkKeys, type Issue } from "@/lib/claims/validate";
import { objectWithValidation } from "@/lib/llm";
import { loadRun, type StageCtx } from "../context";
import { directionProfiles } from "../profiles";

// Product facts count too: without them a direction built on the product's real features reads as "not covered".
const CHECKED_KINDS = ["research", "measured", "belief", "product", "positioning", "avoid"] as const;

export type FitVerdict = "supports" | "tension" | "not_covered";
export type FitOutput = {
  checked: boolean;
  directions: { directionId: string; verdict: FitVerdict; note: string; factIds: string[] }[];
};

const Fit = z.object({
  directions: z.array(
    z.object({
      direction: z.string().describe("Direction key, e.g. D1"),
      verdict: z.enum(["supports", "tension", "not_covered"]),
      note: z.string().describe("One or two plain sentences: which statements this direction builds on or pulls against, and what to test"),
      statements: z.array(z.string()).describe("Statement keys (K…) the note relies on; empty only for not_covered"),
    }),
  ),
});

const SYSTEM = `You compare creative directions with what a brand already knows about its customers and itself.
For each direction say whether the brand's statements support it, pull against it (tension), or don't speak to it (not_covered).
Tension matters most: a direction built on craftsmanship when customer research says convenience matters more should be flagged, with what to test.
Cite the statements you rely on by listing their keys in "statements"; don't put keys in the note. Treat team beliefs as beliefs, not evidence. No predictions about sales or individuals.`;

const KEY_LIST = /\s*\(\s*K\d+(?:\s*(?:,|;|and|&)\s*K\d+)*\s*\)/g;

/** Statement keys belong in "statements"; drop any the model leaves in the note ("… (K4, K5)"). */
export const withoutStatementKeys = (text: string) =>
  text
    .replace(KEY_LIST, "")
    // A key the model still used as a word: keep the sentence readable rather than leaving a hole.
    .replace(/\bK\d+(?:\s*(?:,|and|&)\s*K\d+)*'s\b/g, "the profile's")
    .replace(/\bK\d+(?:\s*(?:,|and|&)\s*K\d+)*\b/g, "the profile")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

export async function checkAgainstProfile(ctx: StageCtx): Promise<FitOutput> {
  const { campaign } = await loadRun(ctx.db, ctx.runId);
  const facts = await ctx.db
    .select({ fact: brandFact, documentName: brandDocument.name })
    .from(brandFact)
    .leftJoin(brandDocument, eq(brandDocument.id, brandFact.documentId))
    .where(and(eq(brandFact.brandOrganizationId, campaign.organizationId), eq(brandFact.status, "approved"), inArray(brandFact.kind, [...CHECKED_KINDS])));
  const profiles = await directionProfiles(ctx.db, ctx.runId);
  if (facts.length === 0 || profiles.length === 0) return { checked: false, directions: [] };

  const keys = new Map(facts.map((f, i) => [`K${i + 1}`, f.fact.id]));
  const statements = facts.map((f, i) => `K${i + 1} (${f.fact.kind}${f.documentName ? `, ${f.documentName}` : ""}): ${f.fact.text}`).join("\n");
  const directions = profiles
    .map((p, i) => {
      const anchors = [...p.tags.slice(0, 6), ...p.entities.slice(0, 4)].map((x) => x.label).join(", ");
      return `D${i + 1} "${p.direction.title}": ${p.direction.audienceContext} Product role: ${p.direction.productRole} Built on: ${anchors}`;
    })
    .join("\n");

  const out = await objectWithValidation(
    ctx.llm,
    { name: "fit with what the brand knows", system: SYSTEM, prompt: `<brand_statements>\n${statements}\n</brand_statements>\n<directions>\n${directions}\n</directions>\nAnswer for every direction.`, schema: Fit, effort: "medium" },
    (v) => {
      const issues: Issue[] = [];
      const seen = new Set<string>();
      v.directions.forEach((d, i) => {
        const n = Number(d.direction.replace(/\D/g, ""));
        if (!(n >= 1 && n <= profiles.length)) issues.push({ path: `directions[${i}].direction`, message: "unknown direction key" });
        seen.add(d.direction);
        if (d.verdict !== "not_covered") issues.push(...checkKeys(d.statements, new Set(keys.keys()), `directions[${i}].statements`));
        issues.push(...checkClaims(d.note, `directions[${i}].note`));
        if (/\bK\d+\b/.test(d.note.replace(KEY_LIST, ""))) {
          issues.push({ path: `directions[${i}].note`, message: "names a statement key (K…) inside a sentence; describe the statement in words (e.g. \"the brand's view that…\") and list its key in \"statements\"" });
        }
      });
      if (seen.size !== profiles.length) issues.push({ path: "directions", message: `answer for all ${profiles.length} directions` });
      return issues;
    },
  );

  return {
    checked: true,
    directions: out.directions.map((d) => ({
      directionId: profiles[Number(d.direction.replace(/\D/g, "")) - 1].direction.id,
      verdict: d.verdict,
      note: withoutStatementKeys(d.note),
      factIds: d.statements.map((k) => keys.get(k)).filter((x): x is string => Boolean(x)),
    })),
  };
}
