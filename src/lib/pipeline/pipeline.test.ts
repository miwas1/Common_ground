// End-to-end pipeline test, offline: real database (PGlite), real roster, real claim rules;
// fake Qloo and fake model that behave like the real ones (keys parsed from prompts).

import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { openPglite, type Db } from "@/db";
import {
  brandFact,
  briefInput,
  budgetPackage,
  campaign,
  campaignRevision,
  claim,
  claimBinding,
  creatorFit,
  direction,
  directionCheck,
  discoveredCreator,
  proposal,
  proposalVersion,
  resolvedReference,
  run,
  runStage,
} from "@/db/schema";
import { createAuth } from "@/lib/auth/create";
import { seedRoster } from "@/lib/demo/roster-seed";
import { seedDemoIdentities } from "@/lib/demo/seed";
import type { Llm, ObjectRequest } from "@/lib/llm";
import type { QlooApi } from "@/lib/qloo/api";
import type { BriefForm, StageCtx } from "./context";
import { applyResolutionChoices } from "./stages/resolve";
import { BASELINE_STAGES, STAGES } from "./stages";

const ok = <T>(data: T) => ({ status: "ok" as const, data, call: { id: undefined } as never });
const TASTE_SEED = "E:Khruangbin";

/** Fake Qloo: deterministic results; removing the Khruangbin seed drops half of the scored concepts. */
function fakeQloo(): QlooApi {
  const tag = (id: string, name: string, affinity: number) => ({ id, name, subtype: id.split(":").slice(0, 4).join(":"), parentTypes: [], affinity });
  return {
    search: async ({ query, types }: { query: string; types: string[] }) =>
      ok(query === "Mystery Band" ? [] : query === "Blue" ? [{ id: "E:blue1", name: "Blue", type: types[0], popularity: 0.6, tags: [] }, { id: "E:blue2", name: "Blue", type: types[0], popularity: 0.58, tags: [] }] : [{ id: `E:${query}`, name: query, type: types[0], popularity: 0.95, tags: [] }]),
    findTags: async ({ query }: { query: string }) => ok([{ id: `T:${query}`, name: query, subtype: "urn:tag:lifestyle:qloo", parentTypes: [] }]),
    findAudiences: async () => ok([{ id: "urn:audience:leisure:coffee", name: "Coffee", type: "urn:audience:leisure" }]),
    tasteProfile: async ({ signals, tagTypes, scoreTags }: { signals: { entities?: string[] }; tagTypes?: string[]; scoreTags?: string[] }) => {
      if (scoreTags) {
        const keepAll = !signals.entities || signals.entities.includes(TASTE_SEED) || signals.entities.length === 0;
        return ok(scoreTags.filter((_, i) => keepAll || i % 2 === 0).map((id, i) => tag(id, id, 0.95 - i * 0.01)));
      }
      const ns = tagTypes?.[0] ?? "urn:tag:lifestyle:qloo";
      return ok(Array.from({ length: 12 }, (_, i) => tag(`${ns}:c${i}`, `${ns.split(":")[2]} concept ${i}`, 0.97 - i * 0.02)));
    },
    recommend: async ({ type, take, explain, signals }: { type: string; take?: number; explain?: boolean; signals: { entities?: string[] } }) =>
      ok({
        entities: Array.from({ length: take ?? 8 }, (_, i) => ({
          id: `${type}:r${i}`,
          name: `${type.split(":")[2]} result ${i}`,
          type,
          affinity: 0.9 - i * 0.02,
          popularity: 0.8,
          tags: [],
          attribution: explain ? (signals.entities ?? []).map((e, k) => ({ entityId: e, score: k === 0 ? 0.6 : 0.4 })) : undefined,
        })),
      }),
    demographics: async ({ entities }: { entities: string[] }) =>
      ok(entities.map((e) => ({ subjectId: e, age: { "30_to_34": 0.3, "35_to_44": 0.2, "45_to_54": -0.5 }, gender: { male: 0.1, female: -0.1 } }))),
    scoreEntities: async ({ entityIds }: { entityIds: string[] }) =>
      ok({ entities: entityIds.filter((_, i) => i % 3 !== 2).map((id, i) => ({ id, name: id, type: "x", affinity: 0.9 - i * 0.01, tags: [] })) }),
  } as unknown as QlooApi;
}

const keys = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[1]);

/** Fake model: answers each step by parsing the keys out of the prompt. */
function fakeLlm() {
  const calls: string[] = [];
  let directionAttempts = 0;
  const llm: Llm = {
    async object<S extends z.ZodType>(req: ObjectRequest<S>): Promise<z.infer<S>> {
      calls.push(req.name);
      const p = req.prompt;
      if (req.name === "understand brief") {
        return {
          summary: "Juniper Coffee is launching a cold brew concentrate for making iced coffee at home.",
          terms: [{ term: "cold brew", meaning: "coffee steeped cold" }],
          peers: ["Stumptown Coffee Roasters"],
          cautions: [],
          talent: ["chef", "food_stylist"],
        } as z.infer<S>;
      }
      if (req.name === "fit with what the brand knows") {
        const dirs = keys(p, /^(D\d+) "/gm);
        const ks = keys(p, /^(K\d+) \(/gm);
        return { directions: dirs.map((d, i) => ({ direction: d, verdict: i === 0 ? "tension" : "not_covered", note: "Customer research leans towards speed over craft.", statements: i === 0 ? ks.slice(0, 1) : [] })) } as z.infer<S>;
      }
      if (req.name === "pick matches") {
        // "Blue" stays a question (two equally plausible brands); "Mystery Band" never reaches here.
        const refs = keys(p, /^(R\d+) "/gm);
        return { picks: refs.map((ref) => ({ ref, choice: "ask" })) } as z.infer<S>;
      }
      if (req.name === "parse brief") {
        return {
          productCategory: "coffee concentrate",
          objectiveSummary: "Launch a coffee concentrate with creator-made paid social",
          references: [
            { label: "Khruangbin", kind: "artist", inputIndex: 0, rationale: "Named in customer research" },
            { label: "Home Cooking", kind: "interest", inputIndex: 1, rationale: "Team observation" },
            { label: "Coffee", kind: "audience_segment", inputIndex: null, rationale: "Category audience" },
            { label: "Blue", kind: "brand", inputIndex: null, rationale: "Ambiguous peer brand" },
            { label: "Mystery Band", kind: "artist", inputIndex: null, rationale: "Unknown to Qloo" },
          ],
          intendedAudience: { ageBands: ["25_to_29", "30_to_34"], gender: "any", summary: "Urban adults in their late twenties and thirties" },
          deliverables: [{ format: "vertical video", count: 3 }],
          constraints: ["No alcohol pairings"],
          missing: ["Whether creators must publish"],
        } as z.infer<S>;
      }
      if (req.name === "synthesize directions") {
        directionAttempts++;
        const tags = keys(p, /^(E\d+) \[tag\]/gm);
        const ents = keys(p, /^(E\d+) \[entity\]/gm);
        return {
          directions: [0, 1, 2].map((i) => ({
            title: `Direction ${["A", "B", "C"][i]}`,
            audienceContext: "People who could enjoy unhurried rituals at home.",
            productRole: "A quick step that could fit an existing ritual.",
            anchors: [tags[i * 2], tags[i * 2 + 1], ents[i]],
            interpretations: [
              // First attempt breaks the number rule; the retry must fix it.
              { text: directionAttempts === 1 ? "This scored 97 so it wins." : "Calm routines could carry the product.", evidence: [tags[i * 2]] },
              { text: "A cultural reference could anchor the setting.", evidence: [ents[i]] },
            ],
            sceneIdeas: ["A morning at the counter"],
            artDirection: { palette: "warm neutrals", settings: ["kitchen"], moodWords: ["calm"] },
            assumptions: ["The audience cooks at home"],
          })),
        } as z.infer<S>;
      }
      if (req.name === "synthesize directions (baseline)") {
        const b = keys(p, /^(B\d+) /gm);
        return {
          directions: [0, 1, 2].map((i) => ({
            title: `Baseline ${["A", "B", "C"][i]}`,
            audienceContext: "People who could enjoy cooking at home.",
            productRole: "A quick step that could fit an existing ritual.",
            anchors: [b[i % b.length]],
            interpretations: [
              { text: "Home cooking could carry the product.", evidence: [b[0]] },
              { text: "Music at home could set the mood.", evidence: [b[b.length - 1]] },
            ],
            sceneIdeas: ["A weeknight dinner"],
            artDirection: { palette: "warm", settings: ["kitchen"], moodWords: ["easy"] },
            assumptions: ["The audience cooks at home"],
          })),
        } as z.infer<S>;
      }
      if (req.name === "judge relevance") {
        const blocks = p.split(/\n(?=D\d+ ")/).filter((b) => /^D\d+ "/.test(b.trim()));
        return {
          judgments: blocks
            .map((b) => ({ d: b.trim().match(/^(D\d+)/)![1], r: keys(b, /(R\d+):/g) }))
            .filter((x) => x.r.length)
            .map((x) => ({ direction: x.d, fit: "aligned", interpretation: "The concepts could suit the intended audience.", evidence: x.r.slice(0, 1) })),
        } as z.infer<S>;
      }
      if (req.name === "judge capability") {
        const blocks = p.split(/\n(?=C\d+ )/).filter((b) => /^C\d+ /.test(b.trim()));
        return {
          judgments: blocks.map((b, i) => ({
            creator: b.trim().match(/^(C\d+)/)![1],
            level: i % 4 === 3 ? "none" : i % 2 === 0 ? "strong" : "partial",
            portfolio: i % 4 === 3 ? [] : keys(b, /(P\d+):/g).slice(0, 1),
            reason: "Their portfolio shows relevant home scenes.",
          })),
        } as z.infer<S>;
      }
      if (req.name.startsWith("proposals for")) {
        const fKeys = keys(p, /^([FB]\d+):/gm);
        const blocks = p.split(/\n(?=C\d+ )/).filter((b) => /^C\d+ /.test(b.trim()));
        return {
          proposals: blocks.map((b) => ({
            creator: b.trim().match(/^(C\d+)/)![1],
            quote: keys(b, /(Q\d+):/g)[0] ?? "none",
            concept: { title: "Dessert that waits", logline: "A host serves an iced dessert drink.", hook: "6am, before anyone wakes.", beats: ["Prep", "Pour", "Serve", "Toast"], productIntegration: "The concentrate is the base.", setting: "Small kitchen" },
            deliverables: [{ format: "vertical video", count: 3, notes: "With hooks" }],
            hypothesis: "Tests whether hosting scenes beat morning rituals for attention.",
            openQuestions: ["Which hook the creator prefers"],
            whyThisCollaboration: [{ text: "The direction's concepts could suit this creator's world.", evidence: fKeys.slice(0, 1) }],
            portfolioEvidence: keys(b, /(P\d+):/g).length ? [{ text: "Their hosting work shows natural ingredient demos.", portfolio: keys(b, /(P\d+):/g).slice(0, 1) }] : [],
          })),
        } as z.infer<S>;
      }
      throw new Error(`fake llm: unexpected ${req.name}`);
    },
  };
  return { llm, calls };
}

describe("research pipeline (offline)", { timeout: 120_000 }, () => {
  let db: Db;
  let ctx: StageCtx;
  let revisionId: string;
  const fake = fakeLlm();

  async function runStage_(position: number) {
    const stage = STAGES.find((s) => s.position === position)!;
    const output = await stage.run(ctx);
    await db.insert(runStage).values({ runId: ctx.runId, position, name: stage.name, status: "done", output }).onConflictDoUpdate({ target: [runStage.runId, runStage.position], set: { output } });
    return output;
  }

  beforeAll(async () => {
    db = await openPglite("memory://");
    const seeded = await seedDemoIdentities(db, createAuth(db), "demo-password-123");
    await seedRoster(db, fakeQloo());
    const brand = seeded.find((s) => s.role === "brand")!;
    const [c] = await db.insert(campaign).values({ name: "Summer coffee launch", organizationId: brand.organizationId }).returning();
    const brief: BriefForm = {
      brandName: "Juniper Coffee",
      product: { name: "Cold Brew Concentrate", description: "A concentrate for iced coffee at home" },
      objective: "Launch with creator-made paid social",
      notes: "Customers mention indie music and home cooking.",
      deliverables: "3 vertical videos with hooks",
      constraints: "No alcohol",
    };
    const [rev] = await db
      .insert(campaignRevision)
      .values({ campaignId: c.id, number: 1, brief, campaignType: "ugc_production", markets: ["US"], languages: ["en"], budgetCents: 1_200_000, currency: "USD", createdBy: brand.userId })
      .returning();
    revisionId = rev.id;
    await db.insert(briefInput).values([
      { revisionId, text: "Customers listen to Khruangbin", source: "research" },
      { revisionId, text: "They cook at home", source: "assumption" },
    ]);
    const [r] = await db.insert(run).values({ revisionId, status: "running" }).returning();
    ctx = { db, runId: r.id, qloo: fakeQloo(), llm: fake.llm };
  });

  it("understands the brief, then parses it and resolves references, pausing on ambiguity", async () => {
    const understood = (await runStage_(0)) as { summary: string; searched: boolean };
    expect(understood).toMatchObject({ searched: false });
    expect(fake.calls).toContain("understand brief");
    await runStage_(1);
    const res = (await runStage_(2)) as { needsInput: number; confirmed: number; notFound: number };
    expect(res).toMatchObject({ needsInput: 1, notFound: 1 });
    expect(fake.calls).toContain("pick matches");
    const refs = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, revisionId));
    const ambiguous = refs.find((r) => r.status === "needs_input")!;
    expect(ambiguous.label).toBe("Blue");
    expect(refs.find((r) => r.label === "Khruangbin")?.briefInputId).not.toBeNull();

    const after = await applyResolutionChoices(db, revisionId, [{ referenceId: ambiguous.id, candidateId: "E:blue2" }]);
    expect(after.remaining).toBe(0);
    const [chosen] = await db.select().from(resolvedReference).where(eq(resolvedReference.id, ambiguous.id));
    expect(chosen).toMatchObject({ status: "confirmed", qlooId: "E:blue2" });
  });

  it("reads the audience and explores, storing ranked evidence", async () => {
    const audience = (await runStage_(3)) as { tagEvidence: number; comparison: { differs: boolean } };
    expect(audience.tagEvidence).toBe(48);
    // Intended ages (25–34) overlap the associated over-index (30–34), so no divergence question.
    expect(audience.comparison.differs).toBe(false);
    const explored = (await runStage_(4)) as { entityEvidence: number; byType: Record<string, number> };
    expect(explored.byType["places in New York"]).toBe(6);
  });

  it("synthesises directions, retrying when a content rule is broken", async () => {
    const out = (await runStage_(5)) as { directions: { id: string }[] };
    expect(out.directions).toHaveLength(3);
    expect(fake.calls.filter((c) => c === "synthesize directions")).toHaveLength(2);

    const claims = await db.select().from(claim).where(and(eq(claim.runId, ctx.runId), eq(claim.ownerType, "direction")));
    const findings = claims.filter((c) => c.kind === "finding");
    const interpretations = claims.filter((c) => c.kind === "interpretation");
    expect(findings.every((f) => f.createdBy === "template" && /ranked #\d+ of \d+/.test(f.text))).toBe(true);
    expect(interpretations.every((i) => !/\d/.test(i.text))).toBe(true);
    const bindings = await db.select().from(claimBinding).where(eq(claimBinding.claimId, interpretations[0].id));
    expect(bindings[0].findingClaimId).not.toBeNull();
  });

  it("runs three separate checks per direction and reports input dependence", async () => {
    await runStage_(6);
    const dirs = await db.select().from(direction).where(eq(direction.runId, ctx.runId));
    const checks = await db.select().from(directionCheck);
    for (const d of dirs) {
      const mine = checks.filter((c) => c.directionId === d.id);
      expect(mine.map((c) => c.kind).sort()).toEqual(["coherence", "relevance", "sensitivity"]);
      const sensitivity = mine.find((c) => c.kind === "sensitivity")!.result as { summary: string; tested: { input: string }[] };
      expect(sensitivity.tested.length).toBeGreaterThanOrEqual(2);
      expect(sensitivity.summary).toContain("Changes when Khruangbin is removed");
      expect(JSON.stringify(sensitivity)).not.toMatch(/Holds up/);
    }
  });

  it("checks directions against the brand's approved profile, and skips the check without one", async () => {
    expect(await runStage_(11)).toEqual({ checked: false, directions: [] });
    const [r] = await db.select({ org: campaign.organizationId }).from(campaign).limit(1);
    await db.insert(brandFact).values([
      { brandOrganizationId: r.org, kind: "research", text: "Customers value speed over craft.", status: "approved", createdBy: "user" },
      { brandOrganizationId: r.org, kind: "belief", text: "Not yet reviewed.", status: "suggested", createdBy: "model" },
    ]);
    const out = (await runStage_(11)) as { checked: boolean; directions: { verdict: string; factIds: string[] }[] };
    expect(out.checked).toBe(true);
    expect(out.directions).toHaveLength(3);
    expect(out.directions[0]).toMatchObject({ verdict: "tension" });
    expect(out.directions[0].factIds).toHaveLength(1);
    // Only approved statements reach the check.
    expect(fake.calls.filter((c) => c === "fit with what the brand knows")).toHaveLength(1);
  });

  it("finds real creators for each direction, ranked within that direction, with their audiences", async () => {
    const out = (await runStage_(10)) as { directions: number; creators: number };
    expect(out).toMatchObject({ directions: 3, creators: 24 });
    const found = await db.select().from(discoveredCreator).where(eq(discoveredCreator.runId, ctx.runId));
    expect(new Set(found.map((f) => f.directionId)).size).toBe(3);
    expect(found.every((f) => f.rank >= 1 && f.rank <= f.resultCount && f.evidenceId)).toBe(true);
    expect(found.every((f) => f.audience !== null)).toBe(true);
  });

  it("casts with separate dimensions and shortlists deterministically", async () => {
    const out = (await runStage_(7)) as { passingConstraints: number; rosterSize: number };
    expect(out.rosterSize).toBe(30);
    // US-only, English, production campaign: UK/DE creators and distribution-only creators are excluded.
    expect(out.passingConstraints).toBeLessThan(18);
    const fits = await db.select().from(creatorFit).where(eq(creatorFit.runId, ctx.runId));
    expect(fits).toHaveLength(30 * 3);
    const shortlisted = fits.filter((f) => f.shortlisted);
    expect(shortlisted.length).toBeLessThanOrEqual(9);
    for (const f of shortlisted) {
      expect((f.hardConstraints as { passed: boolean }).passed).toBe(true);
      expect(["strong", "partial"]).toContain((f.capability as { level: string }).level);
      expect(JSON.stringify(f.culturalBands)).not.toMatch(/match/i);
    }
  });

  it("writes proposals with bound claims and plans budget packages", async () => {
    const out = (await runStage_(8)) as { proposals: number };
    expect(out.proposals).toBeGreaterThanOrEqual(3);
    const versions = await db.select().from(proposalVersion);
    expect(versions.every((v) => v.number === 1 && (v.terms as { quoteId: string }).quoteId)).toBe(true);
    const kinds = new Set((await db.select().from(claim).where(eq(claim.ownerType, "proposal_version"))).map((c) => c.kind));
    expect([...kinds].sort()).toEqual(["commercial", "finding", "interpretation", "portfolio"]);

    await runStage_(9);
    const packages = await db.select().from(budgetPackage).where(eq(budgetPackage.runId, ctx.runId));
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.every((p) => p.costCents <= 1_200_000)).toBe(true);
    const rows = await db.select().from(proposal).where(eq(proposal.runId, ctx.runId));
    expect(rows.every((r) => r.currentVersionId)).toBe(true);
  });

  it("runs a baseline on the same revision without calling Qloo", async () => {
    const [b] = await db.insert(run).values({ revisionId, mode: "baseline", status: "running" }).returning();
    const noQloo = new Proxy({}, { get: () => () => { throw new Error("a baseline run must not call Qloo"); } }) as QlooApi;
    const qlooCtx = ctx;
    ctx = { db, runId: b.id, qloo: noQloo, llm: fake.llm, mode: "baseline" };
    try {
      for (const position of BASELINE_STAGES) await runStage_(position);
    } finally {
      ctx = qlooCtx;
    }
    const claims = await db.select().from(claim).where(eq(claim.runId, b.id));
    expect(claims.some((c) => c.kind === "finding")).toBe(false);
    const interpretations = claims.filter((c) => c.kind === "interpretation");
    expect(interpretations.length).toBeGreaterThan(0);
    expect(interpretations.every((c) => c.basis?.length && c.basis.every((t) => /^(Objective|Team notes|Audience input)/.test(t)))).toBe(true);
    const fits = await db.select().from(creatorFit).where(eq(creatorFit.runId, b.id));
    expect(fits.every((f) => Object.keys(f.culturalBands as object).length === 0)).toBe(true);
    expect((await db.select().from(proposal).where(eq(proposal.runId, b.id))).length).toBeGreaterThanOrEqual(3);
    expect((await db.select().from(budgetPackage).where(eq(budgetPackage.runId, b.id))).length).toBeGreaterThan(0);
  });
});
