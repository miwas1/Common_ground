// Stage 2 — resolve brief references to Qloo entities, tags and audiences.
// Only unambiguous matches are confirmed automatically; anything else pauses the run for the user.

import { eq } from "drizzle-orm";
import { resolvedReference } from "@/db/schema";
import { normalizeName, resolveEntity, resolveTheme, type Candidate, type Resolution } from "@/lib/qloo/resolve";
import type { QlooApi } from "@/lib/qloo/api";
import type { QlooEntityType } from "@/lib/qloo/types";
import { loadRun, stageOutput, type StageCtx } from "../context";
import type { ParsedBrief } from "./brief";

const ENTITY_TYPE: Record<string, QlooEntityType> = {
  brand: "urn:entity:brand",
  artist: "urn:entity:artist",
  tv_show: "urn:entity:tv_show",
  movie: "urn:entity:movie",
  podcast: "urn:entity:podcast",
  book: "urn:entity:book",
};

async function resolveAudience(qloo: QlooApi, label: string): Promise<Resolution> {
  const res = await qloo.findAudiences({ query: label, take: 6 });
  const candidates: Candidate[] = res.data.map((a) => ({ id: a.id, name: a.name, type: a.type, disambiguation: a.disambiguation }));
  if (res.status === "error") return { status: "error", message: res.error.message, candidates };
  const exact = res.data.filter((a) => normalizeName(a.name) === normalizeName(label));
  if (exact.length === 1) return { status: "confirmed", id: exact[0].id, name: exact[0].name, type: exact[0].type, candidates };
  return { status: candidates.length ? "needs_input" : "not_found", candidates };
}

export type ResolveOutput = { total: number; confirmed: number; needsInput: number; notFound: number };

export async function resolveReferences(ctx: StageCtx): Promise<ResolveOutput> {
  const { revision, brief, inputs } = await loadRun(ctx.db, ctx.runId);

  // Resolution belongs to the revision: a retried step or a second run reuses it.
  const existing = await ctx.db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, revision.id));
  if (existing.length === 0) {
    const parsed = await stageOutput<ParsedBrief>(ctx.db, ctx.runId, 1);
    const refs = [{ label: brief.brandName, kind: "brand" as const, inputIndex: null }, ...parsed.references];
    const seen = new Set<string>();
    const unique = refs.filter((r) => {
      const key = `${r.kind}:${normalizeName(r.label)}`;
      if (!r.label.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const resolutions = await Promise.all(
      unique.map((r) =>
        r.kind === "interest"
          ? resolveTheme(ctx.qloo, r.label)
          : r.kind === "audience_segment"
            ? resolveAudience(ctx.qloo, r.label)
            : resolveEntity(ctx.qloo, r.label, ENTITY_TYPE[r.kind]),
      ),
    );
    const failed = resolutions.find((r) => r.status === "error");
    if (failed && failed.status === "error") throw new Error(`Qloo lookup failed: ${failed.message}`);

    await ctx.db.insert(resolvedReference).values(
      unique.map((r, i) => {
        const res = resolutions[i];
        return {
          revisionId: revision.id,
          briefInputId: r.inputIndex !== null ? (inputs[r.inputIndex]?.id ?? null) : null,
          label: r.label,
          qlooKind: r.kind === "interest" ? ("tag" as const) : r.kind === "audience_segment" ? ("audience" as const) : ("entity" as const),
          qlooId: res.status === "confirmed" ? res.id : null,
          qlooType: r.kind === "interest" || r.kind === "audience_segment" ? (res.status === "confirmed" ? (res.type ?? null) : null) : ENTITY_TYPE[r.kind],
          candidates: res.candidates.slice(0, 6),
          status: res.status === "confirmed" ? ("confirmed" as const) : res.status === "needs_input" ? ("needs_input" as const) : ("rejected" as const),
        };
      }),
    );
  }

  const rows = await ctx.db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, revision.id));
  return {
    total: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    needsInput: rows.filter((r) => r.status === "needs_input").length,
    notFound: rows.filter((r) => r.status === "rejected").length,
  };
}

/** Applying the user's choices: pick a candidate, or reject the reference. */
export async function applyResolutionChoices(
  db: StageCtx["db"],
  revisionId: string,
  choices: { referenceId: string; candidateId: string | null }[],
) {
  const rows = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, revisionId));
  for (const choice of choices) {
    const row = rows.find((r) => r.id === choice.referenceId);
    if (!row || row.status !== "needs_input") continue;
    const candidate = (row.candidates as Candidate[]).find((c) => c.id === choice.candidateId);
    await db
      .update(resolvedReference)
      .set(
        candidate
          ? { status: "confirmed", qlooId: candidate.id, qlooType: row.qlooKind === "entity" ? row.qlooType : (candidate.type ?? null), label: candidate.name }
          : { status: "rejected" },
      )
      .where(eq(resolvedReference.id, row.id));
  }
  const after = await db.select({ status: resolvedReference.status }).from(resolvedReference).where(eq(resolvedReference.revisionId, revisionId));
  return { remaining: after.filter((r) => r.status === "needs_input").length };
}
