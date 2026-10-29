// Stage 10 — real creators and talent for each direction. Qloo knows public people; asking for people
// (urn:entity:person) with the brief's brands, the direction's taste profile and the category's talent
// occupations returns the people whose aggregate audience shares that taste: food creators for a
// coffee brand, runners for a running shoe. One query per direction, ranked within it, never compared across directions. Their audiences'
// age and gender skew comes from one demographics query. People found here are suggestions to
// approach: no quote, no availability, nothing about them is assumed beyond what Qloo returned.

import { eq } from "drizzle-orm";
import { discoveredCreator } from "@/db/schema";
import type { QlooEntity } from "@/lib/qloo/types";
import type { CreatorAudience } from "@/lib/roster/qloo";
import { z } from "zod";
import { confirmedSignals, loadRun, optionalStageOutput, type StageCtx } from "../context";
import type { ParsedBrief } from "./brief";
import type { UnderstandOutput } from "./understand";
import { saveEntityEvidence } from "../evidence";
import { directionProfiles, directionSignals } from "../profiles";

/**
 * Who counts as talent depends on the category: food YouTubers and chefs for coffee, ultrarunners and
 * triathletes for running shoes. So the filter is creator occupations (urn:tag:occupation:person:*)
 * plus the category's own talent from "Understanding your brief". With creator occupations alone,
 * running campaigns got explorers and self-help authors; with no filter, a coffee direction built on
 * comedy references got comedians. If the filtered query comes back thin, the unfiltered one is used.
 * Politicians are excluded; people Qloo records as deceased are skipped.
 */
export const EXCLUDED_OCCUPATIONS = ["politician"].map((o) => `urn:tag:occupation:person:${o}`);
/** Occupations shown as "creator" on a suggestion. */
export const CREATOR_OCCUPATIONS = ["youtuber", "video_blogger", "blogger", "influencer", "instagrammer", "tiktoker", "twitch_streamer", "content_creator", "podcaster"];
/** Creator occupations used in the filter: podcasters pulled podcast-led directions towards authors and hosts. */
const FILTER_CREATORS = CREATOR_OCCUPATIONS.filter((o) => o !== "podcaster");
const MIN_FILTERED = 4;

const Talent = z.object({ talent: z.array(z.string()) });

/** The category's talent occupations: from the understanding step, or (for runs made before it listed them) a quick call. */
async function categoryTalent(ctx: StageCtx, productCategory: string, brand: string): Promise<string[]> {
  const understood = await optionalStageOutput<UnderstandOutput>(ctx.db, ctx.runId, 0);
  let talent = understood?.talent;
  if (!talent) {
    const out = await ctx.llm.object({
      name: "category talent",
      system: "You name the kinds of people brands partner with for creator and ambassador content in a product category.",
      prompt: `Brand: ${brand}\nCategory: ${productCategory}\nList up to 8 kinds of people, as snake_case occupation words (e.g. chef, food_stylist, marathon_runner, triathlete).`,
      schema: Talent,
      effort: "low",
    });
    talent = out.talent;
  }
  return [...new Set(talent.map((t) => t.trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")).filter(Boolean))].slice(0, 8);
}

/** Bumped when the query changes, so stored results made the old way are recomputed (see the showcase backfill). */
export const DISCOVERY_METHOD = 5;
export const DISCOVER_TAKE = 8;
const DEMOGRAPHICS_PAGE = 20;

export type DiscoverOutput = { directions: number; creators: number; withInstagram: number; method: number };

export async function discoverCreators(ctx: StageCtx): Promise<DiscoverOutput> {
  const { revision, brief: form } = await loadRun(ctx.db, ctx.runId);
  const parsed = await optionalStageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);
  const profiles = await directionProfiles(ctx.db, ctx.runId);
  const talent = await categoryTalent(ctx, parsed?.productCategory ?? form.product.name, form.brandName);
  const filterTags = [...FILTER_CREATORS, ...talent].map((o) => `urn:tag:occupation:person:${o}`);
  await ctx.db.delete(discoveredCreator).where(eq(discoveredCreator.runId, ctx.runId));

  // The brief's own brands anchor the search in the brand's category; the direction's references and
  // tags then shape it. Without the anchor, a direction built on podcasts returned podcast hosts.
  const brief = await confirmedSignals(ctx.db, revision.id);
  const anchors = [...brief.entities.filter((e) => e.type === "urn:entity:brand"), ...brief.entities.filter((e) => e.type !== "urn:entity:brand")].slice(0, 2);
  const signalsFor = (p: (typeof profiles)[number]) => {
    const own = directionSignals(p);
    return { entities: [...new Set([...anchors.map((a) => a.id), ...own.entities])].slice(0, 5), tags: own.tags };
  };

  // One direction at a time, each leaving out creators already suggested for an earlier direction, so
  // every direction offers different people. Ranks stay within each direction's own query.
  const results = [];
  const suggested: string[] = [];
  for (const p of profiles) {
    const signals = signalsFor(p);
    const ask = (filtered: boolean) =>
      ctx.qloo.recommend({
        type: "urn:entity:person",
        signals,
        take: DISCOVER_TAKE + 2,
        ...(filtered ? { tags: filterTags, tagsOperator: "union" as const } : {}),
        excludeTags: EXCLUDED_OCCUPATIONS,
        excludeEntities: suggested.length ? [...suggested] : undefined,
        // Attribution is only informative with two or more seed entities (PLAN.md §1).
        explain: signals.entities.length >= 2,
      });
    let res = await ask(true);
    if (res.status !== "error" && res.data.entities.length < MIN_FILTERED) res = await ask(false);
    if (res.status === "error") throw new Error(`Qloo creator search failed (${p.direction.title}): ${res.error.message}`);
    // Two extra were asked for, so skipping people Qloo records as deceased still leaves a full list.
    const living = res.data.entities.filter((e) => !e.deceased).slice(0, DISCOVER_TAKE);
    results.push({ ...res, data: { ...res.data, entities: living } });
    suggested.push(...living.map((e) => e.id));
  }

  const people = new Map<string, QlooEntity>();
  for (const res of results) for (const e of res.data.entities) people.set(e.id, e);
  const audience = new Map<string, CreatorAudience>();
  const ids = [...people.keys()];
  for (let i = 0; i < ids.length; i += DEMOGRAPHICS_PAGE) {
    const res = await ctx.qloo.demographics({ entities: ids.slice(i, i + DEMOGRAPHICS_PAGE) });
    // Audience skew is supporting detail: a failed or empty call leaves it unknown rather than stopping the run.
    if (res.status === "ok") for (const d of res.data) audience.set(d.subjectId, { age: d.age, gender: d.gender });
  }

  let total = 0;
  let withInstagram = 0;
  for (const [i, p] of profiles.entries()) {
    const found = results[i].data.entities;
    if (found.length === 0) continue;
    const used = signalsFor(p);
    const labelOf = new Map([...anchors.map((a) => [a.id, a.label] as const), ...p.entities.map((e) => [e.qlooId, e.label] as const), ...p.tags.map((t) => [t.qlooId, t.label] as const)]);
    const labels = [...used.entities, ...used.tags].map((x) => labelOf.get(x)).filter((x): x is string => Boolean(x));
    const saved = await saveEntityEvidence(
      ctx.db,
      ctx.runId,
      found,
      { query: "recommend", profile: labels, resultLabel: "creators" },
      results[i].call.id,
      new Map([...anchors.map((a) => [a.id, a.label] as const), ...p.entities.map((e) => [e.qlooId, e.label] as const)]),
    );
    await ctx.db.insert(discoveredCreator).values(
      found.map((e, rank) => ({
        runId: ctx.runId,
        directionId: p.direction.id,
        evidenceId: saved[rank]?.id ?? null,
        qlooPersonId: e.id,
        name: e.name,
        instagram: e.handles?.instagram ?? null,
        occupations: e.occupations ?? [],
        description: e.description ?? null,
        rank: rank + 1,
        resultCount: found.length,
        audience: audience.get(e.id) ?? null,
      })),
    );
    total += found.length;
    withInstagram += found.filter((e) => e.handles?.instagram).length;
  }
  return { directions: profiles.length, creators: total, withInstagram, method: DISCOVERY_METHOD };
}
