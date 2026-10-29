import "server-only";

// Read model for /about/qloo: how the showcase run used Qloo, counted from its stored provenance,
// and one traced example from request to result to finding to interpretation.
// Everything shown is derived at request time from the private database; no Qloo data is in the repo.

import { and, asc, eq, isNotNull } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";
import { campaign, claim, claimBinding, direction, evidence, qlooCall, resolvedReference, run } from "@/db/schema";
import { findShowcase } from "@/lib/demo/showcase";

export type CallKind =
  | "search"
  | "tags"
  | "audiences"
  | "taste"
  | "score_tags"
  | "demographics"
  | "recommend"
  | "places"
  | "score_entities"
  | "creators"
  | "handles"
  | "other";

/** Which Qloo capability a stored call used, from its endpoint and parameters. */
export function callKind(endpoint: string, params: Record<string, string>): CallKind {
  if (endpoint === "/search") return "search";
  if (endpoint === "/v2/tags") return "tags";
  if (endpoint === "/v2/audiences") return "audiences";
  if (endpoint === "/entities") return params["external.instagram.ids"] ? "handles" : "other";
  if (endpoint !== "/v2/insights") return "other";
  const type = params["filter.type"];
  if (type === "urn:tag") return params["filter.results.tags"] ? "score_tags" : "taste";
  if (type === "urn:demographics") return "demographics";
  if (params["filter.results.entities"]) return "score_entities";
  if (params["filter.location.query"]) return "places";
  if (type === "urn:entity:person") return "creators";
  return type?.startsWith("urn:entity:") ? "recommend" : "other";
}

async function showcaseRun() {
  // Read at request time: the showcase changes whenever it is re-seeded, and the page shell stays prerendered.
  await connection();
  const db = await getDb();
  const showcase = await findShowcase(db);
  if (!showcase?.currentRevisionId) return null;
  const [r] = await db
    .select({ id: run.id, revisionId: run.revisionId })
    .from(run)
    .where(and(eq(run.revisionId, showcase.currentRevisionId), eq(run.status, "done"), eq(run.mode, "qloo")))
    .limit(1);
  return r ? { ...r, campaignId: showcase.id } : null;
}

/** Every Qloo request logged for the showcase campaign (including cache hits), by capability. */
export async function getQlooUsage() {
  const r = await showcaseRun();
  if (!r) return null;
  const db = await getDb();
  const calls = await db
    .select({ endpoint: qlooCall.endpoint, params: qlooCall.params, cached: qlooCall.cached })
    .from(qlooCall)
    .where(eq(qlooCall.campaignId, r.campaignId));
  const byKind = new Map<CallKind, number>();
  for (const c of calls) {
    const k = callKind(c.endpoint, c.params as Record<string, string>);
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  return {
    campaignId: r.campaignId,
    total: calls.length,
    cached: calls.filter((c) => c.cached).length,
    byKind,
    evidenceRows: await db.$count(evidence, eq(evidence.runId, r.id)),
  };
}

/** One interpretation from the showcase, traced back to the exact Qloo request behind it. */
export async function getTracedExample() {
  const r = await showcaseRun();
  if (!r) return null;
  const db = await getDb();
  const dirs = await db.select({ id: direction.id, title: direction.title }).from(direction).where(eq(direction.runId, r.id)).orderBy(asc(direction.colorIndex));

  for (const d of dirs) {
    const interpretations = await db
      .select({ id: claim.id, text: claim.text })
      .from(claim)
      .where(and(eq(claim.ownerType, "direction"), eq(claim.ownerId, d.id), eq(claim.kind, "interpretation")));
    for (const interp of interpretations) {
      const findings = await db
        .select({ id: claim.id, text: claim.text, evidenceId: claimBinding.evidenceId })
        .from(claimBinding)
        .innerJoin(claim, eq(claim.id, claimBinding.findingClaimId))
        .where(eq(claimBinding.claimId, interp.id));
      for (const f of findings) {
        const [fb] = await db.select({ evidenceId: claimBinding.evidenceId }).from(claimBinding).where(and(eq(claimBinding.claimId, f.id), isNotNull(claimBinding.evidenceId)));
        if (!fb?.evidenceId) continue;
        const [ev] = await db.select().from(evidence).where(eq(evidence.id, fb.evidenceId));
        if (!ev?.qlooCallId) continue;
        const [call] = await db.select().from(qlooCall).where(eq(qlooCall.id, ev.qlooCallId));
        if (!call || callKind(call.endpoint, call.params as Record<string, string>) !== "recommend") continue;

        const siblings = await db.select().from(evidence).where(eq(evidence.qlooCallId, call.id)).orderBy(asc(evidence.rank)).limit(12);
        const refs = await db.select({ qlooId: resolvedReference.qlooId, label: resolvedReference.label }).from(resolvedReference).where(eq(resolvedReference.revisionId, r.revisionId));
        const labels = new Map(refs.filter((x) => x.qlooId).map((x) => [x.qlooId!, x.label]));
        const [c] = await db.select({ name: campaign.name }).from(campaign).where(eq(campaign.id, r.campaignId));
        return {
          campaignId: r.campaignId,
          campaignName: c.name,
          direction: d.title,
          call: { endpoint: call.endpoint, params: call.params as Record<string, string>, latencyMs: call.latencyMs, cached: call.cached },
          labels,
          results: siblings.map((s) => ({ id: s.id, label: s.label, rank: s.rank, resultCount: s.resultCount, values: s.values as { affinity?: number; attribution?: { label: string; score: number }[] } })),
          evidenceId: ev.id,
          finding: f.text,
          interpretation: interp.text,
        };
      }
    }
  }
  return null;
}
