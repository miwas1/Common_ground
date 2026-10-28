// Findings: factual statements written by code from stored Qloo evidence (PLAN.md §4.1).
// The model chooses which findings matter; it never writes their text or their numbers.

import type { AgeBand } from "@/lib/qloo/types";

/** How a piece of evidence was obtained, stored with it so a finding can always be re-rendered. */
export type EvidenceContext = {
  /** taste = urn:tag analysis, recommend = cross-domain entities, demographics, score = filter.results */
  query: "taste" | "recommend" | "demographics" | "score";
  /** Human labels of the signals the query used (e.g. the brand and seed references). */
  profile: string[];
  /** e.g. "lifestyle concepts", "music artists", "places in London" */
  resultLabel?: string;
};

export type TagValues = { affinity?: number; popularity?: number; subtype?: string; context: EvidenceContext };
export type EntityValues = {
  affinity?: number;
  popularity?: number;
  entityType: string;
  attribution?: { label: string; score: number }[];
  context: EvidenceContext;
};
export type DemographicValues = {
  age: Partial<Record<AgeBand, number>>;
  gender: { male?: number; female?: number };
  context: EvidenceContext;
};

export type EvidenceForFinding =
  | { kind: "tag"; label: string; rank: number | null; resultCount: number | null; values: TagValues }
  | { kind: "entity"; label: string; rank: number | null; resultCount: number | null; values: EntityValues }
  | { kind: "demographic"; label: string; rank: number | null; resultCount: number | null; values: DemographicValues };

export type RenderedFinding = { text: string; field: string };

const AGE_LABEL: Record<AgeBand, string> = {
  "24_and_younger": "24 and younger",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55 and older",
};

const fmt = (n: number) => n.toFixed(2);
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "0.00");

export function profileLabel(profile: string[]): string {
  if (profile.length === 0) return "the campaign profile";
  if (profile.length <= 3) return profile.join(" + ");
  return `${profile.slice(0, 3).join(" + ")} and ${profile.length - 3} more`;
}

function rankPhrase(rank: number | null, count: number | null, what: string) {
  return rank && count ? `ranked #${rank} of ${count} ${what}` : `appeared among ${what}`;
}

export function renderFinding(e: EvidenceForFinding): RenderedFinding {
  const ctx = e.values.context;
  const profile = profileLabel(ctx.profile);

  switch (e.kind) {
    case "tag": {
      const what = ctx.resultLabel ?? "concepts";
      const affinity = e.values.affinity !== undefined ? ` (affinity ${fmt(e.values.affinity)}, comparable only within this query)` : "";
      const verb = ctx.query === "score" ? `scored against ${profile}` : `associated with ${profile}`;
      return { text: `“${e.label}” ${rankPhrase(e.rank, e.resultCount, what)} ${verb}${affinity}.`, field: "rank" };
    }
    case "entity": {
      const what = ctx.resultLabel ?? "results";
      const affinity = e.values.affinity !== undefined ? ` (affinity ${fmt(e.values.affinity)}, this query only)` : "";
      const attribution = e.values.attribution ?? [];
      const driver =
        attribution.length >= 2
          ? `; the input contributing most was ${attribution[0].label} (${fmt(attribution[0].score)})`
          : "";
      return { text: `${e.label} ${rankPhrase(e.rank, e.resultCount, what)} associated with ${profile}${affinity}${driver}.`, field: "rank" };
    }
    case "demographic": {
      const bands = (Object.entries(e.values.age) as [AgeBand, number][]).sort((a, b) => b[1] - a[1]);
      const over = bands.filter(([, v]) => v >= 0.1).slice(0, 2);
      const under = bands.filter(([, v]) => v <= -0.1).slice(-1);
      const parts: string[] = [];
      if (over.length) parts.push(`over-indexes on ages ${over.map(([b, v]) => `${AGE_LABEL[b]} (${signed(v)})`).join(" and ")}`);
      if (under.length) parts.push(`under-indexes on ${under.map(([b, v]) => `${AGE_LABEL[b]} (${signed(v)})`).join(", ")}`);
      const male = e.values.gender.male;
      if (male !== undefined && Math.abs(male) >= 0.05) parts.push(`gender skew ${male > 0 ? "male" : "female"} ${signed(Math.abs(male))}`);
      const body = parts.length ? parts.join("; ") : "shows no age or gender skew above ±0.10";
      return { text: `The aggregate audience associated with ${e.label} ${body} (relative to average, not individuals).`, field: "values.age" };
    }
  }
}
