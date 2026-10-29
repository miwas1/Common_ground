// Stage 7 — casting (PLAN.md §4.3). Separate dimensions, never one "match %":
//   hard constraints → capability (portfolio, model-judged, bound to items) → cultural bands (Qloo).
// The roster is the brand's own (brand_creator); a brand that hasn't added anyone yet uses the demo roster.
// Cultural fit: one scoring query per (direction, entity type) over the whole roster, ranked within
// that query only; each creator gets their best reference (more references never help);
// a reference Qloo does not return is "not measured", not zero. City never counts as cultural fit.
// Creators Qloo knows as people also get an audience band: the person ranked against the direction.
// A creator with no quote stays in the running as "quote required"; only a quote over budget rules them out.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { brandCreator, claim, creator, creatorFit, creatorReference, creatorTheme, discoveredCreator, orgProfile, portfolioItem, quote } from "@/db/schema";
import { attachPortfolioClaim } from "@/lib/claims/persist";
import { checkInterpretation, PROSE_RULES, type Issue } from "@/lib/claims/validate";
import { objectWithValidation } from "@/lib/llm";
import type { QlooEntityType } from "@/lib/qloo/types";
import { loadRun, stageOutput, type LoadedRun, type StageCtx } from "../context";
import { convertCents } from "../money";
import { directionProfiles, directionSignals, type DirectionProfile } from "../profiles";
import type { ParsedBrief } from "./brief";

export type Band = "top quarter" | "middle" | "lower" | "not measured";
export type BandResult = { band: Band; best: string | null; measured: number; of: number };
export type Capability = { level: "strong" | "partial" | "none" | "not assessed"; reason: string | null; portfolioItemIds: string[] };

const TYPE_LABEL: Record<string, string> = {
  "urn:entity:artist": "music",
  "urn:entity:tv_show": "TV",
  "urn:entity:movie": "film",
  "urn:entity:podcast": "podcasts",
  "urn:entity:book": "books",
  "urn:entity:brand": "brands",
};
/** The band for a creator Qloo knows as a person: how their audience ranks against the direction. */
export const AUDIENCE_BAND = "audience";
export const SHORTLIST_SIZE = 3;
const SCORE_PAGE = 50;

export async function loadRoster(db: Db, brandOrganizationId: string | null) {
  const links = brandOrganizationId ? await db.select().from(brandCreator).where(eq(brandCreator.brandOrganizationId, brandOrganizationId)) : [];
  const [profile] = brandOrganizationId ? await db.select({ isDemo: orgProfile.isDemo }).from(orgProfile).where(eq(orgProfile.organizationId, brandOrganizationId)) : [];
  // A brand that hasn't added creators yet works from the shared demo roster. Demo brands (shared by
  // everyone trying the product) always keep it, so one visitor's additions never empty another's casting.
  const useDemo = links.length === 0 || (profile?.isDemo ?? false);
  const own = links.length ? await db.select().from(creator).where(inArray(creator.id, links.map((l) => l.creatorId))) : [];
  const demo = useDemo ? await db.select().from(creator).where(eq(creator.isDemo, true)) : [];
  const creators = [...new Map([...demo, ...own].map((c) => [c.id, c])).values()];
  const ids = creators.map((c) => c.id);
  if (ids.length === 0) return [];
  const [items, refs, themes, quotes] = await Promise.all([
    db.select().from(portfolioItem).where(inArray(portfolioItem.creatorId, ids)),
    db.select().from(creatorReference).where(and(inArray(creatorReference.creatorId, ids), eq(creatorReference.confirmed, true))),
    db.select().from(creatorTheme).where(and(inArray(creatorTheme.creatorId, ids), eq(creatorTheme.confirmed, true))),
    db.select().from(quote).where(and(inArray(quote.creatorId, ids), isNull(quote.campaignId))),
  ]);
  return creators.map((c) => ({
    creator: c,
    /** The brand's own record of this creator (preferred, excluded, notes); null on the demo fallback. */
    link: links.find((l) => l.creatorId === c.id) ?? null,
    portfolio: items.filter((i) => i.creatorId === c.id),
    refs: refs.filter((r) => r.creatorId === c.id && r.qlooId),
    themes: themes.filter((t) => t.creatorId === c.id && t.tagId),
    quotes: quotes.filter((q) => q.creatorId === c.id),
  }));
}
export type RosterEntry = Awaited<ReturnType<typeof loadRoster>>[number];

export function hardConstraints(entry: RosterEntry, run: LoadedRun, productCategory: string) {
  const { creator: c } = entry;
  const r = run.revision;
  const failures: string[] = [];
  // Fields a brand hasn't recorded (country, languages, work types) are unknown, not failures.
  if (entry.link?.excluded) failures.push(`Excluded by your team${entry.link.exclusionReason ? `: ${entry.link.exclusionReason}` : ""}`);
  if (c.country && !r.markets.includes(c.country)) failures.push(`Based outside the campaign markets (${c.country})`);
  if (c.languages.length && !c.languages.some((l) => r.languages.includes(l))) failures.push("Does not work in the campaign languages");
  const availability = c.availability as { status?: string; leadTimeDays?: number };
  if (availability.status === "booked") failures.push("Fully booked");
  if (c.modes.length && r.campaignType === "ugc_production" && !c.modes.includes("ugc_production")) failures.push("Does not take production-only work");
  if (c.modes.length && r.campaignType === "creator_distribution" && !c.modes.includes("creator_distribution")) failures.push("Does not offer distribution");
  const category = productCategory.toLowerCase();
  const declined = c.declinedCategories.find((d) => category.includes(d.toLowerCase()) || d.toLowerCase().includes(category));
  if (declined) failures.push(`Declines ${declined} work`);
  const cheapest = Math.min(...entry.quotes.map((q) => convertCents(q.amountCents, q.currency, r.currency)));
  const quoteRequired = !Number.isFinite(cheapest);
  if (!quoteRequired && r.budgetCents && cheapest > r.budgetCents) failures.push("Lowest quote exceeds the budget");
  return { passed: failures.length === 0, failures, cheapestCents: quoteRequired ? null : cheapest, quoteRequired };
}

/** Rank → band within one query's returned results. */
export function bandFor(position: number, returned: number): Band {
  const pct = position / Math.max(1, returned);
  return pct < 0.25 ? "top quarter" : pct < 0.75 ? "middle" : "lower";
}

/** Best band across a creator's items in one query; unreturned items are not measured. */
export function bestBand(items: { id: string; label: string }[], positions: Map<string, number>, returned: number): BandResult {
  const measured = items.filter((i) => positions.has(i.id));
  if (measured.length === 0) return { band: "not measured", best: null, measured: 0, of: items.length };
  const best = measured.reduce((a, b) => (positions.get(a.id)! <= positions.get(b.id)! ? a : b));
  return { band: bandFor(positions.get(best.id)!, returned), best: best.label, measured: measured.length, of: items.length };
}

const LEVEL: Record<Capability["level"], number> = { strong: 2, partial: 1, none: 0, "not assessed": -1 };

/**
 * Deterministic shortlist rule, shown in the UI: capability, then the team's preferred creators, then
 * top-quarter bands, then middle bands, then price (creators still to quote come after priced ones).
 * Preferred breaks ties within a capability level; it never lifts a creator over relevant past work.
 */
export function shortlistOrder(
  a: { capability: Capability; bands: Record<string, BandResult>; cheapestCents: number | null; preferred?: boolean },
  b: typeof a,
) {
  const count = (x: typeof a, band: Band) => Object.values(x.bands).filter((r) => r.band === band).length;
  return (
    LEVEL[b.capability.level] - LEVEL[a.capability.level] ||
    Number(b.preferred ?? false) - Number(a.preferred ?? false) ||
    count(b, "top quarter") - count(a, "top quarter") ||
    count(b, "middle") - count(a, "middle") ||
    (a.cheapestCents ?? Infinity) - (b.cheapestCents ?? Infinity)
  );
}

async function culturalBands(ctx: StageCtx, p: DirectionProfile, roster: RosterEntry[]) {
  const signals = directionSignals(p);
  const byType = new Map<string, Map<string, string>>(); // type → qlooId → label
  for (const e of roster) for (const r of e.refs) {
    if (!r.qlooType || !TYPE_LABEL[r.qlooType]) continue;
    if (!byType.has(r.qlooType)) byType.set(r.qlooType, new Map());
    byType.get(r.qlooType)!.set(r.qlooId!, r.label);
  }
  const positions = new Map<string, { positions: Map<string, number>; returned: number }>();
  for (const [type, ids] of byType) {
    const all = [...ids.keys()];
    const affinities: [string, number][] = [];
    for (let i = 0; i < all.length; i += SCORE_PAGE) {
      const res = await ctx.qloo.scoreEntities({ type: type as QlooEntityType, signals, entityIds: all.slice(i, i + SCORE_PAGE) });
      if (res.status === "error") throw new Error(`Qloo scoring failed (${TYPE_LABEL[type]}): ${res.error.message}`);
      for (const e of res.data.entities) if (e.affinity !== undefined) affinities.push([e.id, e.affinity]);
    }
    affinities.sort((a, b) => b[1] - a[1]);
    positions.set(type, { positions: new Map(affinities.map(([id], i) => [id, i])), returned: affinities.length });
  }
  // Creators Qloo knows as people: rank them against the direction in one query, together with the
  // people Qloo found for this direction (stage 10), so a band means "compared with the best-matching
  // real people", not "first of the two roster creators Qloo happens to know".
  const found = await ctx.db.select({ id: discoveredCreator.qlooPersonId }).from(discoveredCreator).where(and(eq(discoveredCreator.runId, ctx.runId), eq(discoveredCreator.directionId, p.direction.id)));
  const rosterPeople = roster.map((e) => e.creator.qlooPersonId).filter((x): x is string => Boolean(x));
  const personIds = rosterPeople.length ? [...new Set([...rosterPeople, ...found.map((f) => f.id)])] : [];
  let personPositions = { positions: new Map<string, number>(), returned: 0 };
  if (personIds.length) {
    const affinities: [string, number][] = [];
    for (let i = 0; i < personIds.length; i += SCORE_PAGE) {
      const res = await ctx.qloo.scoreEntities({ type: "urn:entity:person", signals, entityIds: personIds.slice(i, i + SCORE_PAGE) });
      if (res.status === "error") throw new Error(`Qloo scoring failed (creators): ${res.error.message}`);
      for (const e of res.data.entities) if (e.affinity !== undefined) affinities.push([e.id, e.affinity]);
    }
    affinities.sort((a, b) => b[1] - a[1]);
    personPositions = { positions: new Map(affinities.map(([id], i) => [id, i])), returned: affinities.length };
  }

  const themeIds = [...new Set(roster.flatMap((e) => e.themes.map((t) => t.tagId!)))];
  let themePositions = { positions: new Map<string, number>(), returned: 0 };
  if (themeIds.length) {
    const res = await ctx.qloo.tasteProfile({ signals, scoreTags: themeIds });
    if (res.status === "error") throw new Error(`Qloo theme scoring failed: ${res.error.message}`);
    const ranked = res.data.filter((t) => t.affinity !== undefined).sort((a, b) => b.affinity! - a.affinity!);
    themePositions = { positions: new Map(ranked.map((t, i) => [t.id, i])), returned: ranked.length };
  }

  return new Map(
    roster.map((e) => {
      const bands: Record<string, BandResult> = {};
      for (const [type, q] of positions) {
        const mine = e.refs.filter((r) => r.qlooType === type).map((r) => ({ id: r.qlooId!, label: r.label }));
        if (mine.length) bands[TYPE_LABEL[type]] = bestBand(mine, q.positions, q.returned);
      }
      const myThemes = e.themes.map((t) => ({ id: t.tagId!, label: t.label }));
      if (myThemes.length) bands.themes = bestBand(myThemes, themePositions.positions, themePositions.returned);
      if (e.creator.qlooPersonId) {
        bands[AUDIENCE_BAND] = bestBand([{ id: e.creator.qlooPersonId, label: e.creator.displayName }], personPositions.positions, personPositions.returned);
      }
      return [e.creator.id, bands];
    }),
  );
}

/** Creator and portfolio keys (C3, P12) belong in the key fields; drop any the model leaves in prose. */
export const withoutKeys = (text: string) =>
  text
    .replace(/\(\s*[CP]\d+(?:\s*(?:,|;|\/|&|and)\s*[CP]\d+)*\s*\)/g, "")
    .replace(/\b[CP]\d+\b/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

const CapabilitySchema = z.object({
  judgments: z.array(
    z.object({
      creator: z.string().describe("Creator key, e.g. C3"),
      level: z.enum(["strong", "partial", "none"]),
      portfolio: z.array(z.string()).describe("Portfolio keys (P…) that show the capability; empty only when level is none"),
      reason: z.string().describe("Why, in words; no keys or numbers"),
    }),
  ),
});

async function judgeCapability(ctx: StageCtx, p: DirectionProfile, candidates: RosterEntry[]) {
  const pKeys = new Map<string, { id: string; creatorId: string }>();
  const lines = candidates.map((e, ci) => {
    const items = e.portfolio
      .map((it) => {
        const key = `P${pKeys.size + 1}`;
        pKeys.set(key, { id: it.id, creatorId: e.creator.id });
        return `  ${key}: "${it.title}" — role: ${it.role}; formats: ${it.formats.join(", ")}; settings: ${it.settings.join(", ")}; ${it.description}`;
      })
      .join("\n");
    return `C${ci + 1} ${e.creator.displayName} (${e.creator.city}) — ${e.creator.proposition ?? e.creator.bio}\n${items}`;
  });
  const art = p.direction.artDirection as { sceneIdeas?: string[]; settings?: string[] };
  const out = await objectWithValidation(
    ctx.llm,
    {
      name: "judge capability",
      system: `You are a creative producer judging whether creators can execute a campaign direction, using only their portfolio. Judge the work, never follower counts or personal taste. Cite work by listing its keys in "portfolio"; the reason is a short sentence in words, with no keys.\n${PROSE_RULES}`,
      prompt: `<direction>\n${p.direction.title} — ${p.direction.audienceContext}\nProduct role: ${p.direction.productRole}\nScene ideas: ${(art.sceneIdeas ?? []).join("; ")}\nSettings: ${(art.settings ?? []).join("; ")}\n</direction>\n<creators>\n${lines.join("\n")}\n</creators>\nJudge every creator exactly once.`,
      schema: CapabilitySchema,
      effort: "medium",
    },
    (v) => {
      const issues: Issue[] = [];
      const seen = new Set<string>();
      v.judgments.forEach((j, i) => {
        const idx = Number(j.creator.replace(/\D/g, "")) - 1;
        if (!(idx >= 0 && idx < candidates.length)) return issues.push({ path: `judgments[${i}].creator`, message: "unknown creator key" });
        if (seen.has(j.creator)) issues.push({ path: `judgments[${i}].creator`, message: "judged twice" });
        seen.add(j.creator);
        if (j.level !== "none" && j.portfolio.length === 0) issues.push({ path: `judgments[${i}].portfolio`, message: "cite at least one portfolio key" });
        for (const k of j.portfolio) {
          if (pKeys.get(k)?.creatorId !== candidates[idx].creator.id) issues.push({ path: `judgments[${i}].portfolio`, message: `${k} is not this creator's work` });
        }
        issues.push(...checkInterpretation(withoutKeys(j.reason), `judgments[${i}].reason`));
      });
      if (seen.size !== candidates.length) issues.push({ path: "judgments", message: `judge all ${candidates.length} creators` });
      return issues;
    },
  );
  return new Map(
    out.judgments.map((j) => [
      candidates[Number(j.creator.replace(/\D/g, "")) - 1].creator.id,
      { level: j.level, reason: withoutKeys(j.reason), portfolioItemIds: j.portfolio.map((k) => pKeys.get(k)!.id) } satisfies Capability,
    ]),
  );
}

export async function cast(ctx: StageCtx) {
  const run = await loadRun(ctx.db, ctx.runId);
  const parsed = await stageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);
  const profiles = await directionProfiles(ctx.db, ctx.runId);
  const roster = await loadRoster(ctx.db, run.campaign.organizationId);

  await ctx.db.delete(claim).where(and(eq(claim.runId, ctx.runId), eq(claim.ownerType, "creator_fit")));
  await ctx.db.delete(creatorFit).where(eq(creatorFit.runId, ctx.runId));

  const constraints = new Map(roster.map((e) => [e.creator.id, hardConstraints(e, run, parsed.productCategory)]));
  const passing = roster.filter((e) => constraints.get(e.creator.id)!.passed);
  // Capability is judged from portfolio work; a creator with none on file is "not assessed", not ruled out.
  const judged = passing.filter((e) => e.portfolio.length > 0);

  const summary: { directionId: string; shortlisted: string[]; passing: number }[] = [];
  for (const p of profiles) {
    const [bands, capability] = await Promise.all([
      // A baseline run has no Qloo profile: capability and price decide the shortlist on their own.
      passing.length && ctx.mode !== "baseline" ? culturalBands(ctx, p, passing) : Promise.resolve(new Map<string, Record<string, BandResult>>()),
      judged.length ? judgeCapability(ctx, p, judged) : Promise.resolve(new Map<string, Capability>()),
    ]);
    const ranked = passing
      .map((e) => ({
        entry: e,
        capability:
          capability.get(e.creator.id) ??
          ((e.portfolio.length ? { level: "none", reason: null, portfolioItemIds: [] } : { level: "not assessed", reason: null, portfolioItemIds: [] }) as Capability),
        bands: bands.get(e.creator.id) ?? {},
        cheapestCents: constraints.get(e.creator.id)!.cheapestCents,
        preferred: e.link?.preferred ?? false,
      }))
      .filter((x) => x.capability.level !== "none")
      .sort(shortlistOrder);
    const shortlisted = new Set(ranked.slice(0, SHORTLIST_SIZE).map((x) => x.entry.creator.id));

    for (const e of roster) {
      const hc = constraints.get(e.creator.id)!;
      const cap = hc.passed && e.portfolio.length ? (capability.get(e.creator.id) ?? { level: "none", reason: null, portfolioItemIds: [] }) : { level: "not assessed", reason: null, portfolioItemIds: [] };
      const [fit] = await ctx.db
        .insert(creatorFit)
        .values({
          runId: ctx.runId,
          creatorId: e.creator.id,
          directionId: p.direction.id,
          hardConstraints: hc,
          capability: cap,
          culturalBands: bands.get(e.creator.id) ?? {},
          shortlisted: shortlisted.has(e.creator.id),
        })
        .returning({ id: creatorFit.id });
      if (cap.reason && cap.portfolioItemIds.length) {
        await attachPortfolioClaim(ctx.db, ctx.runId, { type: "creator_fit", id: fit.id }, cap.reason, cap.portfolioItemIds);
      }
    }
    summary.push({ directionId: p.direction.id, shortlisted: [...shortlisted], passing: passing.length });
  }
  return { rosterSize: roster.length, passingConstraints: passing.length, directions: summary };
}
