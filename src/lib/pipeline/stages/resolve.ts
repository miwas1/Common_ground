// Stage 2 — resolve brief references to Qloo entities, tags and audiences.
// Exact, unambiguous matches are confirmed by name. For the rest, the model reads Qloo's candidates
// against what the brief means and picks one, drops the name, or (only when two candidates are
// both plausible and the brief cannot tell them apart) pauses the run for the user.

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Issue } from "@/lib/claims/validate";
import { LlmValidationError, objectWithValidation } from "@/lib/llm";
import { resolvedReference } from "@/db/schema";
import { normalizeName, resolveEntity, resolveTheme, type Candidate, type Resolution } from "@/lib/qloo/resolve";
import type { QlooApi } from "@/lib/qloo/api";
import type { QlooEntityType } from "@/lib/qloo/types";
import { loadRun, optionalStageOutput, stageOutput, type StageCtx } from "../context";
import type { ParsedBrief } from "./brief";
import { briefText, type UnderstandOutput } from "./understand";

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

export type ResolveOutput = {
  total: number;
  confirmed: number;
  needsInput: number;
  notFound: number;
  /** Names matched by reading the brief rather than by exact name, shown so the user can check them. */
  matched?: { from: string; to: string }[];
  /** Names dropped because none of Qloo's candidates meant the same thing. */
  dropped?: string[];
};

const Picks = z.object({
  picks: z.array(
    z.object({
      ref: z.string().describe("The R key"),
      choice: z.string().describe("A candidate key such as R1.C2, or 'none', or 'ask'"),
    }),
  ),
});

const PICK_SYSTEM = `You match names from a campaign brief to entries in a cultural catalogue.
For each name, pick the candidate that means the same thing in this brief. A close everyday equivalent counts ("day trading" → "Day Trading" or "Active Trading"; "forex" → "Trading" or "Currency Trading" if listed).
For an interest with no same-meaning candidate, the broader category it clearly belongs to is a match ("Cryptocurrency" → "Investing"); a concept that only sounds related is not ("forex" → "Financial Freedom").
For a brand, film, show or artist, pick only the same thing. A candidate that shares part of the name is a different organisation unless its name or description shows it is the same one ("Apex" or "Apex Legends" is not "Apex Trader Funding").
Answer "none" when nothing fits by these rules.
Answer "ask" only when two or more candidates are each a plausible reading and the brief gives no way to choose. This should be rare: the person wrote the brief to be understood.`;

type Pending = { label: string; kind: string; candidates: Candidate[] };

/** The model's reading of ambiguous names; anything it leaves unanswered or answers invalidly stays a question. */
export async function pickMatches(ctx: StageCtx, context: string, pending: Pending[]) {
  const listing = pending
    .map((p, i) => `R${i + 1} "${p.label}" (${p.kind})\n${p.candidates.map((c, k) => `  R${i + 1}.C${k + 1}: ${c.name}${c.disambiguation && c.disambiguation !== c.name ? ` (${c.disambiguation})` : ""}`).join("\n")}`)
    .join("\n");
  const answer = await objectWithValidation(
    ctx.llm,
    { name: "pick matches", system: PICK_SYSTEM, prompt: `${context}\n<names>\n${listing}\n</names>\nAnswer for every R key.`, schema: Picks, effort: "medium" },
    (v) => {
      const issues: Issue[] = [];
      v.picks.forEach((p, i) => {
        const n = Number(p.ref.slice(1));
        if (!/^R\d+$/.test(p.ref) || n < 1 || n > pending.length) issues.push({ path: `picks[${i}].ref`, message: "must be one of the R keys listed" });
        else if (p.choice !== "none" && p.choice !== "ask") {
          const m = p.choice.match(/^R(\d+)\.C(\d+)$/);
          if (!m || Number(m[1]) !== n || Number(m[2]) < 1 || Number(m[2]) > pending[n - 1].candidates.length) {
            issues.push({ path: `picks[${i}].choice`, message: `must be one of ${p.ref}'s candidate keys, "none" or "ask"` });
          }
        }
      });
      return issues;
    },
  ).catch((err) => {
    // An answer that never validates is not worth stopping the run for: ask the user instead.
    if (err instanceof LlmValidationError) return { picks: [] };
    throw err;
  });
  const { picks } = answer;
  return pending.map((p, i) => {
    const choice = picks.find((x) => x.ref === `R${i + 1}`)?.choice ?? "ask";
    if (choice === "none" || choice === "ask") return choice;
    return p.candidates[Number(choice.split(".C")[1]) - 1];
  });
}

export async function resolveReferences(ctx: StageCtx): Promise<ResolveOutput> {
  const loaded = await loadRun(ctx.db, ctx.runId);
  const { revision, brief, inputs } = loaded;
  const matched: { from: string; to: string }[] = [];
  const dropped: string[] = [];

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

    const open = unique.flatMap((r, i) => (resolutions[i].status === "needs_input" ? [i] : []));
    if (open.length > 0) {
      const understood = await optionalStageOutput<UnderstandOutput>(ctx.db, ctx.runId, 0);
      const context = `<brief>\n${briefText(loaded)}\n</brief>${understood ? `\n<what_the_brief_means>\n${understood.summary}\n${understood.terms.map((t) => `${t.term} = ${t.meaning}`).join("\n")}\n</what_the_brief_means>` : ""}`;
      const picks = await pickMatches(ctx, context, open.map((i) => ({ label: unique[i].label, kind: unique[i].kind, candidates: resolutions[i].candidates.slice(0, 6) })));
      open.forEach((i, k) => {
        const pick = picks[k];
        if (pick === "ask") return;
        if (pick === "none") {
          resolutions[i] = { status: "not_found", candidates: [] };
          dropped.push(unique[i].label);
        } else {
          resolutions[i] = { status: "confirmed", id: pick.id, name: pick.name, type: pick.type, candidates: resolutions[i].candidates };
          matched.push({ from: unique[i].label, to: pick.name });
        }
      });
    }

    await ctx.db.insert(resolvedReference).values(
      unique.map((r, i) => {
        const res = resolutions[i];
        return {
          revisionId: revision.id,
          briefInputId: r.inputIndex !== null ? (inputs[r.inputIndex]?.id ?? null) : null,
          label: res.status === "confirmed" ? res.name : r.label,
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
    ...(matched.length ? { matched } : {}),
    ...(dropped.length ? { dropped } : {}),
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
