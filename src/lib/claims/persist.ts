// Writing claims and their bindings. Findings are rendered here from evidence rows (never taken
// from model output); the database additionally rejects any finding not created by a template.

import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { claim, claimBinding, evidence } from "@/db/schema";
import { renderFinding, type EvidenceForFinding } from "./findings";

export type ClaimOwner = { type: "direction" | "proposal_version" | "creator_fit"; id: string };

type EvidenceRow = typeof evidence.$inferSelect;

export function toFindingInput(row: EvidenceRow): EvidenceForFinding {
  return {
    kind: row.kind as EvidenceForFinding["kind"],
    label: row.label,
    rank: row.rank,
    resultCount: row.resultCount,
    values: row.values as never,
  };
}

/** Create one finding claim per evidence row (scoped to this run). Returns evidenceId → claimId. */
export async function attachFindings(db: Db, runId: string, owner: ClaimOwner, evidenceIds: string[]) {
  const ids = [...new Set(evidenceIds)];
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select()
    .from(evidence)
    .where(and(eq(evidence.runId, runId), inArray(evidence.id, ids)));
  if (rows.length !== ids.length) throw new Error("A finding references evidence outside this run");

  const out = new Map<string, string>();
  for (const row of rows) {
    const rendered = renderFinding(toFindingInput(row));
    const [c] = await db
      .insert(claim)
      .values({ runId, ownerType: owner.type, ownerId: owner.id, kind: "finding", text: rendered.text, createdBy: "template" })
      .returning({ id: claim.id });
    await db.insert(claimBinding).values({ claimId: c.id, evidenceId: row.id, field: rendered.field });
    out.set(row.id, c.id);
  }
  return out;
}

/** A model-written interpretation, bound to the finding claims it interprets. */
export async function attachInterpretation(db: Db, runId: string, owner: ClaimOwner, text: string, findingClaimIds: string[]) {
  if (findingClaimIds.length === 0) throw new Error("An interpretation must cite at least one finding");
  const [c] = await db
    .insert(claim)
    .values({ runId, ownerType: owner.type, ownerId: owner.id, kind: "interpretation", text, createdBy: "model" })
    .returning({ id: claim.id });
  await db.insert(claimBinding).values(findingClaimIds.map((findingClaimId) => ({ claimId: c.id, findingClaimId })));
  return c.id;
}

/**
 * A baseline run's interpretation (the Evaluate comparison). It rests on the brief alone, which has no
 * evidence rows to bind to, so it has no bindings; the brief statements it cites are kept in `basis`.
 */
export async function attachBriefInterpretation(db: Db, runId: string, owner: ClaimOwner, text: string, basis: string[]) {
  const [c] = await db
    .insert(claim)
    .values({ runId, ownerType: owner.type, ownerId: owner.id, kind: "interpretation", text, createdBy: "model", basis })
    .returning({ id: claim.id });
  return c.id;
}

/** A statement about a creator's work, bound to the portfolio pieces that show it. */
export async function attachPortfolioClaim(db: Db, runId: string, owner: ClaimOwner, text: string, portfolioItemIds: string[]) {
  if (portfolioItemIds.length === 0) throw new Error("A portfolio claim must cite at least one portfolio item");
  const [c] = await db
    .insert(claim)
    .values({ runId, ownerType: owner.type, ownerId: owner.id, kind: "portfolio", text, createdBy: "model" })
    .returning({ id: claim.id });
  await db.insert(claimBinding).values(portfolioItemIds.map((portfolioItemId) => ({ claimId: c.id, portfolioItemId })));
  return c.id;
}

export async function attachCommercialClaim(db: Db, runId: string, owner: ClaimOwner, text: string, quoteId: string) {
  const [c] = await db
    .insert(claim)
    .values({ runId, ownerType: owner.type, ownerId: owner.id, kind: "commercial", text, createdBy: "template" })
    .returning({ id: claim.id });
  await db.insert(claimBinding).values({ claimId: c.id, quoteId, field: "amount_cents" });
  return c.id;
}
