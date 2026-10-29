// What Qloo knows about a creator as a public person: occupations, how they were matched, and the
// aggregate age and gender skew of the people who like them. Only public handles and public names
// are sent to Qloo; contact details and notes never are.

import { normalizeName } from "@/lib/qloo/resolve";
import type { QlooApi } from "@/lib/qloo/api";
import type { AgeBand, DemographicSkew, QlooEntity } from "@/lib/qloo/types";

export type CreatorAudience = { age: DemographicSkew["age"]; gender: DemographicSkew["gender"] };

export type QlooPersonProfile = {
  name: string;
  occupations: string[];
  description: string | null;
  popularity: number | null;
  instagram: string | null;
  audience: CreatorAudience | null;
  /** instagram: the handle resolved to this person; name: a single exact-name match, worth checking; qloo: added from a Qloo suggestion */
  matchedVia: "instagram" | "name" | "qloo";
  checkedAt: string;
};

const OCCUPATION: Record<string, string> = {
  youtuber: "YouTuber",
  tiktoker: "TikToker",
  instagrammer: "Instagrammer",
  video_blogger: "Video blogger",
  internet_celebrity: "Internet personality",
  twitch_streamer: "Twitch streamer",
  content_creator: "Content creator",
};

export const occupationLabel = (o: string) => OCCUPATION[o] ?? o.charAt(0).toUpperCase() + o.slice(1).replaceAll("_", " ");

const AGE_LABEL: Record<AgeBand, string> = {
  "24_and_younger": "under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

/** The ages and gender an audience leans towards (skew of at least 0.1 against the average). */
export function audienceLean(a: CreatorAudience | null | undefined) {
  if (!a) return null;
  const ages = (Object.entries(a.age) as [AgeBand, number][])
    .filter(([, v]) => v >= 0.1)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([b]) => b);
  const male = a.gender.male ?? 0;
  const gender = male >= 0.1 ? "male" : male <= -0.1 ? "female" : null;
  return { ages, gender } as { ages: AgeBand[]; gender: "male" | "female" | null };
}

export function describeLean(lean: ReturnType<typeof audienceLean>) {
  if (!lean || (lean.ages.length === 0 && !lean.gender)) return "No clear age or gender lean";
  return [lean.ages.length ? `ages ${lean.ages.map((b) => AGE_LABEL[b]).join(", ")}` : null, lean.gender].filter(Boolean).join(" · ");
}

/** Whether an audience's age lean overlaps the ages the brief is aiming at. Null when either side is unknown. */
export function leanMatchesIntended(lean: ReturnType<typeof audienceLean>, intendedAges: string[]) {
  if (!lean || lean.ages.length === 0 || intendedAges.length === 0) return null;
  return lean.ages.some((b) => intendedAges.includes(b));
}

function profileOf(e: QlooEntity, via: QlooPersonProfile["matchedVia"], audience: CreatorAudience | null, instagram?: string | null): QlooPersonProfile {
  return {
    name: e.name,
    occupations: e.occupations ?? [],
    description: e.description ?? null,
    popularity: e.popularity ?? null,
    instagram: instagram ?? e.handles?.instagram ?? null,
    audience,
    matchedVia: via,
    checkedAt: new Date().toISOString(),
  };
}

export async function audienceOf(qloo: QlooApi, personId: string): Promise<CreatorAudience | null> {
  const res = await qloo.demographics({ entities: [personId] });
  const row = res.status === "ok" ? res.data.find((d) => d.subjectId === personId) : undefined;
  return row ? { age: row.age, gender: row.gender } : null;
}

/**
 * Find a creator in Qloo: by Instagram handle first (exact), otherwise by name, accepting only a
 * single exact-name match among people. Returns null when Qloo doesn't know them.
 */
export async function matchPerson(qloo: QlooApi, input: { name: string; instagram?: string | null }) {
  let person: QlooEntity | undefined;
  let via: QlooPersonProfile["matchedVia"] = "instagram";
  if (input.instagram) {
    const res = await qloo.personByInstagram(input.instagram);
    if (res.status === "error") throw new Error(`Qloo lookup failed: ${res.error.message}`);
    person = res.data[0];
  }
  if (!person && input.name.trim()) {
    const res = await qloo.search({ query: input.name, types: ["urn:entity:person"], take: 5 });
    if (res.status === "error") throw new Error(`Qloo lookup failed: ${res.error.message}`);
    const exact = res.data.filter((e) => e.type === "urn:entity:person" && normalizeName(e.name) === normalizeName(input.name));
    if (exact.length === 1) {
      person = exact[0];
      via = "name";
    }
  }
  if (!person) return null;
  return { personId: person.id, profile: profileOf(person, via, await audienceOf(qloo, person.id), input.instagram) };
}
