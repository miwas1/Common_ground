// Stage 4 — explore the cross-category world around the brief's references, plus local places per market.

import type { QlooEntityType } from "@/lib/qloo/types";
import { confirmedSignals, loadRun, signalLabels, type StageCtx } from "../context";
import { saveEntityEvidence } from "../evidence";

export const EXPLORE_TYPES: { type: QlooEntityType; label: string }[] = [
  { type: "urn:entity:artist", label: "music artists" },
  { type: "urn:entity:tv_show", label: "TV shows" },
  { type: "urn:entity:movie", label: "films" },
  { type: "urn:entity:podcast", label: "podcasts" },
  { type: "urn:entity:book", label: "books" },
  { type: "urn:entity:brand", label: "brands" },
  { type: "urn:entity:destination", label: "destinations" },
];

/** City used to localise place results per market (Qloo locality names). */
export const MARKET_CITY: Record<string, string> = { US: "New York", GB: "London", DE: "Berlin" };

export type ExploreOutput = { entityEvidence: number; byType: Record<string, number> };

export async function explore(ctx: StageCtx): Promise<ExploreOutput> {
  const { revision } = await loadRun(ctx.db, ctx.runId);
  const signals = await confirmedSignals(ctx.db, revision.id);
  const seeds = signals.entities.slice(0, 5);
  const profile = signalLabels({ entities: seeds, tags: signals.tags });
  const inputLabels = new Map(seeds.map((s) => [s.id, s.label]));
  const base = { entities: seeds.map((s) => s.id), tags: signals.tags.map((t) => t.id) };

  const queries = [
    ...EXPLORE_TYPES.map((t) => ({ ...t, inLocation: undefined as string | undefined })),
    ...revision.markets
      .filter((m) => MARKET_CITY[m])
      .map((m) => ({ type: "urn:entity:place" as QlooEntityType, label: `places in ${MARKET_CITY[m]}`, inLocation: MARKET_CITY[m] })),
  ];

  const results = await Promise.all(
    queries.map((q) =>
      ctx.qloo.recommend({
        type: q.type,
        signals: base,
        take: q.inLocation ? 6 : 8,
        inLocation: q.inLocation,
        excludeEntities: base.entities,
        // Attribution is only informative with two or more seed entities (PLAN.md §1).
        explain: seeds.length >= 2,
      }),
    ),
  );

  const byType: Record<string, number> = {};
  let total = 0;
  for (const [i, res] of results.entries()) {
    if (res.status === "error") throw new Error(`Qloo recommendations failed (${queries[i].label}): ${res.error.message}`);
    const saved = await saveEntityEvidence(
      ctx.db,
      ctx.runId,
      res.data.entities,
      { query: "recommend", profile, resultLabel: queries[i].label },
      res.call.id,
      inputLabels,
    );
    byType[queries[i].label] = saved.length;
    total += saved.length;
  }
  return { entityEvidence: total, byType };
}
