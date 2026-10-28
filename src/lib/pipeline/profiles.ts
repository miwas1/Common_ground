// A direction's Qloo profile is derived from the evidence its finding claims cite — the claims are
// the single source of truth for what a direction rests on.

import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { claim, claimBinding, direction, evidence } from "@/db/schema";

export type ProfileItem = { qlooId: string; label: string; evidenceId: string; type?: string };
export type DirectionProfile = {
  direction: typeof direction.$inferSelect;
  tags: ProfileItem[];
  entities: ProfileItem[];
};

export async function directionProfiles(db: Db, runId: string): Promise<DirectionProfile[]> {
  const dirs = await db.select().from(direction).where(eq(direction.runId, runId)).orderBy(direction.colorIndex);
  const rows = await db
    .select({ ownerId: claim.ownerId, ev: evidence })
    .from(claim)
    .innerJoin(claimBinding, eq(claimBinding.claimId, claim.id))
    .innerJoin(evidence, eq(claimBinding.evidenceId, evidence.id))
    .where(and(eq(claim.runId, runId), eq(claim.ownerType, "direction"), eq(claim.kind, "finding")));

  return dirs.map((d) => {
    const mine = rows.filter((r) => r.ownerId === d.id && r.ev.qlooRef);
    const item = (r: (typeof mine)[number]): ProfileItem => ({
      qlooId: r.ev.qlooRef!,
      label: r.ev.label,
      evidenceId: r.ev.id,
      type: (r.ev.values as { entityType?: string }).entityType,
    });
    const uniq = (items: ProfileItem[]) => [...new Map(items.map((i) => [i.qlooId, i])).values()];
    return {
      direction: d,
      tags: uniq(mine.filter((r) => r.ev.kind === "tag").map(item)),
      entities: uniq(mine.filter((r) => r.ev.kind === "entity" && (r.ev.values as { entityType?: string }).entityType !== "urn:entity:place").map(item)),
    };
  });
}

/** Signals for querying Qloo "as this direction". */
export const directionSignals = (p: DirectionProfile) => ({
  entities: p.entities.slice(0, 5).map((e) => e.qlooId),
  tags: p.tags.slice(0, 8).map((t) => t.qlooId),
});
