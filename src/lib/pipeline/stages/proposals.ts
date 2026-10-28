// Stage 8 — write complete collaboration proposals: creator and concept as one decision (PLAN.md §4).

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { claim, claimBinding, creatorFit, evidence, proposal, proposalVersion } from "@/db/schema";
import { renderFinding } from "@/lib/claims/findings";
import { attachCommercialClaim, attachFindings, attachInterpretation, attachPortfolioClaim, toFindingInput } from "@/lib/claims/persist";
import { checkClaims, checkInterpretation, checkKeys, PROSE_RULES, type Issue } from "@/lib/claims/validate";
import { objectWithValidation } from "@/lib/llm";
import { loadRun, stageOutput, type StageCtx } from "../context";
import { formatMoney } from "../money";
import { directionProfiles } from "../profiles";
import type { ParsedBrief } from "./brief";
import { loadRoster, type Capability } from "./cast";

export const PROPOSALS_PER_DIRECTION = 2;

const ProposalSchema = z.object({
  proposals: z.array(
    z.object({
      creator: z.string().describe("Creator key, e.g. C1"),
      quote: z.string().describe("Quote key (Q…) of the package this proposal uses"),
      concept: z.object({
        title: z.string(),
        logline: z.string().describe("One sentence: what happens in the video"),
        hook: z.string().describe("The opening line or moment"),
        beats: z.array(z.string()).describe("4–6 story beats"),
        productIntegration: z.string().describe("How the product earns its place in the story"),
        setting: z.string(),
      }),
      deliverables: z.array(z.object({ format: z.string(), count: z.number(), notes: z.string() })),
      hypothesis: z.string().describe("What the brand learns by commissioning this, framed as a test"),
      openQuestions: z.array(z.string()).describe("What remains uncertain or needs the creator's input"),
      whyThisCollaboration: z
        .array(z.object({ text: z.string(), evidence: z.array(z.string()) }))
        .describe("1–3 hedged readings linking the direction's findings (F keys) to this collaboration"),
      portfolioEvidence: z
        .array(z.object({ text: z.string(), portfolio: z.array(z.string()) }))
        .describe("1–3 statements about the creator's relevant work, citing their portfolio keys"),
    }),
  ),
});

const SYSTEM = `You are a creative producer writing collaboration proposals that pair a specific creator with a specific concept.
- The concept should fit the creator's demonstrated work and the direction; make it concrete and filmable.
- "whyThisCollaboration" items are hedged interpretations citing direction findings (F keys): no numbers, no superlatives, no predictions of purchasing or performance, and never claims about the creator's followers.
- "portfolioEvidence" items describe the creator's own work and cite their portfolio keys (P…), without numbers.
- Choose a quote (Q key) from that creator's packages that fits the requested deliverables.
${PROSE_RULES}
Portfolio statements follow the same rules.`;

export async function writeProposals(ctx: StageCtx) {
  const run = await loadRun(ctx.db, ctx.runId);
  const parsed = await stageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);
  const profiles = await directionProfiles(ctx.db, ctx.runId);
  const roster = new Map((await loadRoster(ctx.db)).map((e) => [e.creator.id, e]));
  const fits = await ctx.db.select().from(creatorFit).where(and(eq(creatorFit.runId, ctx.runId), eq(creatorFit.shortlisted, true)));

  // Idempotent on retry.
  await ctx.db.delete(claim).where(and(eq(claim.runId, ctx.runId), eq(claim.ownerType, "proposal_version")));
  await ctx.db.delete(proposal).where(eq(proposal.runId, ctx.runId));

  // Pick creators per direction, preferring creators not already used by an earlier direction.
  const used = new Set<string>();
  const plan = profiles.map((p) => {
    const candidates = fits.filter((f) => f.directionId === p.direction.id).map((f) => f.creatorId);
    const fresh = candidates.filter((c) => !used.has(c));
    const chosen = [...fresh, ...candidates.filter((c) => used.has(c))].slice(0, PROPOSALS_PER_DIRECTION);
    chosen.forEach((c) => used.add(c));
    return { profile: p, creatorIds: chosen };
  });

  // Direction findings available for citation (F keys), per direction.
  const directionEvidence = await ctx.db
    .select({ ownerId: claim.ownerId, ev: evidence })
    .from(claim)
    .innerJoin(claimBinding, eq(claimBinding.claimId, claim.id))
    .innerJoin(evidence, eq(claimBinding.evidenceId, evidence.id))
    .where(and(eq(claim.runId, ctx.runId), eq(claim.ownerType, "direction"), eq(claim.kind, "finding")));

  const results = await Promise.all(
    plan
      .filter((x) => x.creatorIds.length > 0)
      .map(async ({ profile: p, creatorIds }) => {
        const fKeys = new Map<string, string>();
        const fLines = [...new Map(directionEvidence.filter((r) => r.ownerId === p.direction.id).map((r) => [r.ev.id, r.ev])).values()].map((ev) => {
          const key = `F${fKeys.size + 1}`;
          fKeys.set(key, ev.id);
          return `${key}: ${renderFinding(toFindingInput(ev)).text}`;
        });
        const pKeys = new Map<string, { id: string; creatorId: string }>();
        const qKeys = new Map<string, { id: string; creatorId: string }>();
        const creatorLines = creatorIds.map((cid, ci) => {
          const e = roster.get(cid)!;
          const fit = fits.find((f) => f.creatorId === cid && f.directionId === p.direction.id)!;
          const portfolio = e.portfolio
            .map((it) => {
              const k = `P${pKeys.size + 1}`;
              pKeys.set(k, { id: it.id, creatorId: cid });
              return `  ${k}: "${it.title}" (${it.role}; ${it.formats.join(", ")}; ${it.settings.join(", ")}) ${it.description}`;
            })
            .join("\n");
          const quotes = e.quotes
            .map((q) => {
              const k = `Q${qKeys.size + 1}`;
              qKeys.set(k, { id: q.id, creatorId: cid });
              return `  ${k}: ${q.package} — ${formatMoney(q.amountCents, q.currency)} — ${q.usageTerms}`;
            })
            .join("\n");
          return `C${ci + 1} ${e.creator.displayName}, ${e.creator.city} — ${e.creator.proposition}\n  Capability note: ${(fit.capability as Capability).reason ?? "n/a"}\n${portfolio}\n${quotes}`;
        });
        const art = p.direction.artDirection as { palette?: string; settings?: string[]; moodWords?: string[]; sceneIdeas?: string[] };
        const prompt = `<campaign>
Brand: ${run.brief.brandName}; product: ${run.brief.product.name} (${parsed.productCategory}) — ${run.brief.product.description}
Objective: ${parsed.objectiveSummary}
Requested deliverables: ${parsed.deliverables.map((d) => `${d.count} × ${d.format}`).join(", ") || run.brief.deliverables || "not specified"}
Constraints: ${parsed.constraints.join("; ") || "none"}
</campaign>
<direction>
${p.direction.title} — ${p.direction.audienceContext}
Product role: ${p.direction.productRole}
Art direction: palette ${art.palette ?? "-"}; settings ${(art.settings ?? []).join(", ")}; mood ${(art.moodWords ?? []).join(", ")}
Scene ideas: ${(art.sceneIdeas ?? []).join("; ")}
Findings:
${fLines.join("\n")}
</direction>
<creators>
${creatorLines.join("\n")}
</creators>
Write exactly one proposal for each creator listed.`;

        const out = await objectWithValidation(
          ctx.llm,
          { name: `proposals for ${p.direction.title}`, system: SYSTEM, prompt, schema: ProposalSchema, effort: "high" },
          (v) => {
            const issues: Issue[] = [];
            const seen = new Set<string>();
            v.proposals.forEach((pr, i) => {
              const path = `proposals[${i}]`;
              const idx = Number(pr.creator.replace(/\D/g, "")) - 1;
              const cid = creatorIds[idx];
              if (!cid) return issues.push({ path: `${path}.creator`, message: "unknown creator key" });
              if (seen.has(cid)) issues.push({ path: `${path}.creator`, message: "only one proposal per creator" });
              seen.add(cid);
              if (qKeys.get(pr.quote)?.creatorId !== cid) issues.push({ path: `${path}.quote`, message: "must be one of this creator's quote keys" });
              if (pr.concept.beats.length < 4 || pr.concept.beats.length > 6) issues.push({ path: `${path}.concept.beats`, message: "give 4–6 beats" });
              if (pr.whyThisCollaboration.length < 1) issues.push({ path: `${path}.whyThisCollaboration`, message: "give at least one" });
              pr.whyThisCollaboration.forEach((w, j) => {
                issues.push(...checkKeys(w.evidence, new Set(fKeys.keys()), `${path}.whyThisCollaboration[${j}].evidence`));
                issues.push(...checkInterpretation(w.text, `${path}.whyThisCollaboration[${j}].text`));
              });
              if (pr.portfolioEvidence.length < 1) issues.push({ path: `${path}.portfolioEvidence`, message: "give at least one" });
              pr.portfolioEvidence.forEach((w, j) => {
                if (w.portfolio.length === 0) issues.push({ path: `${path}.portfolioEvidence[${j}]`, message: "cite a portfolio key" });
                for (const k of w.portfolio) if (pKeys.get(k)?.creatorId !== cid) issues.push({ path: `${path}.portfolioEvidence[${j}]`, message: `${k} is not this creator's work` });
                issues.push(...checkInterpretation(w.text, `${path}.portfolioEvidence[${j}].text`));
              });
              const copy = [pr.concept.title, pr.concept.logline, pr.concept.hook, pr.concept.productIntegration, ...pr.concept.beats, ...pr.openQuestions];
              copy.forEach((c, j) => issues.push(...checkClaims(c, `${path}.copy[${j}]`)));
              issues.push(...checkClaims(pr.hypothesis, `${path}.hypothesis`));
              if (/%/.test(pr.hypothesis)) issues.push({ path: `${path}.hypothesis`, message: "do not predict percentages" });
            });
            if (seen.size !== creatorIds.length) issues.push({ path: "proposals", message: `write exactly ${creatorIds.length} proposals, one per creator` });
            return issues;
          },
        );
        return { p, creatorIds, out, fKeys, pKeys, qKeys };
      }),
  );

  const created: string[] = [];
  for (const { p, creatorIds, out, fKeys, pKeys, qKeys } of results) {
    for (const pr of out.proposals) {
      const cid = creatorIds[Number(pr.creator.replace(/\D/g, "")) - 1];
      const e = roster.get(cid)!;
      const q = e.quotes.find((x) => x.id === qKeys.get(pr.quote)!.id)!;
      const [row] = await ctx.db.insert(proposal).values({ runId: ctx.runId, directionId: p.direction.id, creatorId: cid }).returning({ id: proposal.id });
      const [version] = await ctx.db
        .insert(proposalVersion)
        .values({
          proposalId: row.id,
          number: 1,
          authorRole: "agent",
          concept: { ...pr.concept, openQuestions: pr.openQuestions },
          deliverables: pr.deliverables,
          terms: {
            quoteId: q.id,
            package: q.package,
            amountCents: q.amountCents,
            currency: q.currency,
            usageTerms: q.usageTerms,
            validUntil: q.validUntil?.toISOString() ?? null,
          },
          hypothesis: pr.hypothesis,
          changeNote: "Drafted by the agent",
        })
        .returning({ id: proposalVersion.id });
      await ctx.db.update(proposal).set({ currentVersionId: version.id }).where(eq(proposal.id, row.id));

      const owner = { type: "proposal_version" as const, id: version.id };
      const cited = [...new Set(pr.whyThisCollaboration.flatMap((w) => w.evidence))];
      const findingByEvidence = await attachFindings(ctx.db, ctx.runId, owner, cited.map((k) => fKeys.get(k)!));
      for (const w of pr.whyThisCollaboration) {
        await attachInterpretation(ctx.db, ctx.runId, owner, w.text, w.evidence.map((k) => findingByEvidence.get(fKeys.get(k)!)!));
      }
      for (const w of pr.portfolioEvidence) {
        await attachPortfolioClaim(ctx.db, ctx.runId, owner, w.text, w.portfolio.map((k) => pKeys.get(k)!.id));
      }
      const valid = q.validUntil ? `; quote valid until ${q.validUntil.toISOString().slice(0, 10)}` : "";
      await attachCommercialClaim(
        ctx.db,
        ctx.runId,
        owner,
        `${e.creator.displayName} quoted ${formatMoney(q.amountCents, q.currency)} for “${q.package}”; usage: ${q.usageTerms}${valid}.`,
        q.id,
      );
      created.push(row.id);
    }
  }
  return { proposals: created.length, directions: results.length };
}

/** Proposals of a run with their current version (used by the planner and the UI). */
export async function proposalsWithVersions(db: StageCtx["db"], runId: string) {
  const rows = await db.select().from(proposal).where(eq(proposal.runId, runId));
  const versionIds = rows.map((r) => r.currentVersionId).filter((v): v is string => Boolean(v));
  const versions = versionIds.length ? await db.select().from(proposalVersion).where(inArray(proposalVersion.id, versionIds)) : [];
  return rows.map((r) => ({ proposal: r, version: versions.find((v) => v.id === r.currentVersionId) ?? null }));
}
