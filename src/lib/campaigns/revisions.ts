// Refinement (PLAN.md §4.4): every change creates a new immutable revision and a full new run.
// The new revision copies the brief and the user's decisions (audience inputs with their sources,
// confirmed and rejected references) minus what was removed. Nothing derived is carried over:
// directions, checks, casting, proposals and packages are recomputed by the new run.

import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { briefInput, campaign, campaignRevision, resolvedReference, run } from "@/db/schema";

export type RevisionChange =
  | { type: "remove_reference"; referenceId: string }
  | { type: "remove_input"; inputId: string }
  | { type: "set_budget"; budgetCents: number };

export class RevisionError extends Error {}

const ACTIVE = ["pending", "running", "needs_input"] as const;

/** Create the next revision of a campaign from its current one. Returns the new revision's id. */
export async function deriveRevision(db: Db, campaignId: string, change: RevisionChange, createdBy: string | null) {
  const [c] = await db.select().from(campaign).where(eq(campaign.id, campaignId));
  if (!c?.currentRevisionId) throw new RevisionError("This campaign has no brief yet.");
  const [current] = await db.select().from(campaignRevision).where(eq(campaignRevision.id, c.currentRevisionId));
  const [active] = await db
    .select({ id: run.id })
    .from(run)
    .where(and(eq(run.revisionId, current.id), eq(run.mode, "qloo"), inArray(run.status, [...ACTIVE])))
    .limit(1);
  if (active) throw new RevisionError("Wait for the research to finish, or cancel it, before making a change.");

  const inputs = await db.select().from(briefInput).where(eq(briefInput.revisionId, current.id));
  const refs = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, current.id));

  let changeNote: string;
  let keepInputs = inputs;
  let keepRefs = refs.filter((r) => r.status !== "needs_input");
  let budgetCents = current.budgetCents;
  switch (change.type) {
    case "remove_reference": {
      const ref = refs.find((r) => r.id === change.referenceId && r.status === "confirmed");
      if (!ref) throw new RevisionError("That name is no longer in this version of the brief.");
      if (refs.filter((r) => r.status === "confirmed").length <= 1) throw new RevisionError("Keep at least one name in the brief.");
      keepRefs = keepRefs.filter((r) => r.id !== ref.id);
      changeNote = `Removed “${ref.label}”`;
      break;
    }
    case "remove_input": {
      const input = inputs.find((i) => i.id === change.inputId);
      if (!input) throw new RevisionError("That audience note is no longer in this version of the brief.");
      keepInputs = inputs.filter((i) => i.id !== input.id);
      // References that came from this statement go with it.
      keepRefs = keepRefs.filter((r) => r.briefInputId !== input.id);
      changeNote = `Removed the audience note “${input.text}”`;
      break;
    }
    case "set_budget": {
      if (!(change.budgetCents > 0)) throw new RevisionError("Enter a budget above zero.");
      budgetCents = change.budgetCents;
      changeNote = `Budget changed to ${(change.budgetCents / 100).toLocaleString("en-US")} ${current.currency}`;
      break;
    }
  }

  const [latest] = await db
    .select({ number: campaignRevision.number })
    .from(campaignRevision)
    .where(eq(campaignRevision.campaignId, campaignId))
    .orderBy(desc(campaignRevision.number))
    .limit(1);
  const [rev] = await db
    .insert(campaignRevision)
    .values({
      campaignId,
      number: latest.number + 1,
      parentRevisionId: current.id,
      changeNote,
      brief: current.brief,
      campaignType: current.campaignType,
      markets: current.markets,
      languages: current.languages,
      budgetCents,
      currency: current.currency,
      createdBy,
    })
    .returning({ id: campaignRevision.id });

  const inputIds = new Map<string, string>();
  for (const i of keepInputs) {
    const [n] = await db.insert(briefInput).values({ revisionId: rev.id, text: i.text, source: i.source, confirmed: i.confirmed }).returning({ id: briefInput.id });
    inputIds.set(i.id, n.id);
  }
  if (keepRefs.length) {
    await db.insert(resolvedReference).values(
      keepRefs.map((r) => ({
        revisionId: rev.id,
        briefInputId: r.briefInputId ? (inputIds.get(r.briefInputId) ?? null) : null,
        label: r.label,
        qlooKind: r.qlooKind,
        qlooId: r.qlooId,
        qlooType: r.qlooType,
        candidates: r.candidates,
        status: r.status,
      })),
    );
  }
  return { revisionId: rev.id, changeNote };
}
