// Storing Qloo results as evidence rows: one row per returned item, with its rank in that result
// list and the context needed to render a finding later.

import type { Db } from "@/db";
import { evidence } from "@/db/schema";
import type { EvidenceContext } from "@/lib/claims/findings";
import type { QlooEntity, QlooTag, DemographicSkew } from "@/lib/qloo/types";

type Inserted = { id: string; qlooRef: string | null; label: string };

export async function saveTagEvidence(db: Db, runId: string, tags: QlooTag[], context: EvidenceContext, qlooCallId: string | undefined) {
  if (tags.length === 0) return [] as Inserted[];
  return db
    .insert(evidence)
    .values(
      tags.map((t, i) => ({
        runId,
        kind: "tag" as const,
        qlooRef: t.id,
        label: t.name,
        values: { affinity: t.affinity, popularity: t.popularity, subtype: t.subtype, context },
        rank: i + 1,
        resultCount: tags.length,
        qlooCallId: qlooCallId ?? null,
      })),
    )
    .returning({ id: evidence.id, qlooRef: evidence.qlooRef, label: evidence.label });
}

export async function saveEntityEvidence(
  db: Db,
  runId: string,
  entities: QlooEntity[],
  context: EvidenceContext,
  qlooCallId: string | undefined,
  inputLabels: Map<string, string>,
) {
  if (entities.length === 0) return [] as Inserted[];
  return db
    .insert(evidence)
    .values(
      entities.map((e, i) => ({
        runId,
        kind: "entity" as const,
        qlooRef: e.id,
        label: e.name,
        values: {
          affinity: e.affinity,
          popularity: e.popularity,
          entityType: e.type,
          description: e.description,
          imageUrl: e.imageUrl,
          place: e.place,
          attribution: e.attribution
            ?.map((a) => ({ label: inputLabels.get(a.entityId) ?? "an input", score: a.score }))
            .sort((a, b) => b.score - a.score),
          context,
        },
        rank: i + 1,
        resultCount: entities.length,
        qlooCallId: qlooCallId ?? null,
      })),
    )
    .returning({ id: evidence.id, qlooRef: evidence.qlooRef, label: evidence.label });
}

export async function saveDemographicEvidence(db: Db, runId: string, rows: DemographicSkew[], labels: Map<string, string>, qlooCallId: string | undefined) {
  if (rows.length === 0) return [] as Inserted[];
  return db
    .insert(evidence)
    .values(
      rows.map((d) => ({
        runId,
        kind: "demographic" as const,
        qlooRef: d.subjectId,
        label: labels.get(d.subjectId) ?? d.subjectId,
        values: { age: d.age, gender: d.gender, context: { query: "demographics", profile: [] } satisfies EvidenceContext },
        qlooCallId: qlooCallId ?? null,
      })),
    )
    .returning({ id: evidence.id, qlooRef: evidence.qlooRef, label: evidence.label });
}
