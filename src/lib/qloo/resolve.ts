// Turning human labels into Qloo IDs. Search is fuzzy ("Blue Bottle" also returns the Blue Jays),
// so a label is only confirmed automatically when the match is unambiguous; everything else
// goes back to a person with candidates to choose from (PLAN.md §4, stage 2).

import type { QlooApi } from "./api";
import type { QlooEntity, QlooEntityType, QlooTag } from "./types";

export type Candidate = { id: string; name: string; type?: string; popularity?: number; disambiguation?: string };

export type Resolution =
  | { status: "confirmed"; id: string; name: string; type?: string; candidates: Candidate[] }
  | { status: "needs_input" | "not_found"; candidates: Candidate[] }
  | { status: "error"; message: string; candidates: Candidate[] };

/** Case-, accent- and punctuation-insensitive form used for exact-name comparison. */
export function normalizeName(s: string): string {
  return s
    .replace(/ı/g, "i")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Among several exact matches, the most popular wins only if it is popular and clearly ahead. */
const DOMINANT_POPULARITY = 0.9;
const DOMINANT_GAP = 0.05;

const toCandidate = (e: QlooEntity): Candidate => ({
  id: e.id,
  name: e.name,
  type: e.type,
  popularity: e.popularity,
  disambiguation: e.disambiguation,
});

export async function resolveEntity(api: QlooApi, label: string, type: QlooEntityType): Promise<Resolution> {
  const res = await api.search({ query: label, types: [type], take: 5 });
  const candidates = res.data.map(toCandidate);
  if (res.status === "error") return { status: "error", message: res.error.message, candidates };

  const target = normalizeName(label);
  const exact = res.data
    .filter((e) => e.type === type && normalizeName(e.name) === target)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  if (exact.length === 0) return { status: candidates.length ? "needs_input" : "not_found", candidates };
  const [top, second] = exact;
  const dominant =
    exact.length === 1 ||
    ((top.popularity ?? 0) >= DOMINANT_POPULARITY && (top.popularity ?? 0) - (second.popularity ?? 0) >= DOMINANT_GAP);
  if (!dominant) return { status: "needs_input", candidates: exact.map(toCandidate) };
  return { status: "confirmed", id: top.id, name: top.name, type: top.type, candidates };
}

/** Tag namespaces that describe how people live, in order of preference for creator themes. */
export const THEME_TAG_TYPES = ["urn:tag:lifestyle:qloo", "urn:tag:hobby:qloo", "urn:tag:aesthetic_property:qloo"];

const tagCandidate = (t: QlooTag): Candidate => ({ id: t.id, name: t.name, type: t.subtype });

export async function resolveTheme(api: QlooApi, label: string): Promise<Resolution> {
  const res = await api.findTags({ query: label, take: 8, tagTypes: THEME_TAG_TYPES });
  const candidates = res.data.map(tagCandidate);
  if (res.status === "error") return { status: "error", message: res.error.message, candidates };

  const target = normalizeName(label);
  const exact = res.data
    .filter((t) => normalizeName(t.name) === target && THEME_TAG_TYPES.includes(t.subtype ?? ""))
    .sort((a, b) => THEME_TAG_TYPES.indexOf(a.subtype ?? "") - THEME_TAG_TYPES.indexOf(b.subtype ?? ""));
  const pick = exact[0];
  if (!pick) return { status: candidates.length ? "needs_input" : "not_found", candidates };
  return { status: "confirmed", id: pick.id, name: pick.name, type: pick.subtype, candidates };
}
