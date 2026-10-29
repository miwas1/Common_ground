import "server-only";

// A brand's creator roster: the people the team can actually commission. Creators the brand adds are
// owned by the brand's organization; each field that changes decisions records who supplied it and
// when (rate, availability, audience). Qloo matching sends only a public handle or public name.

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { user } from "@/db/auth-schema";
import { brandCreator, campaign, campaignRevision, creator, discoveredCreator, orgProfile, portfolioItem, quote, run } from "@/db/schema";
import type { QlooApi } from "@/lib/qloo/api";
import type { RosterInput } from "./csv";
import { matchPerson, type QlooPersonProfile } from "./qloo";

export type Provenance = { by: string; at: string };
export type RosterProvenance = { rate?: Provenance; availability?: Provenance; audience?: Provenance };

const QLOO_AUDIENCE = "Qloo (aggregate audience)";
const now = () => new Date().toISOString();

async function userName(db: Db, userId: string) {
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  return u?.name || "Your team";
}

async function link(db: Db, org: string, creatorId: string) {
  const [row] = await db
    .select()
    .from(brandCreator)
    .where(and(eq(brandCreator.brandOrganizationId, org), eq(brandCreator.creatorId, creatorId)));
  return row ?? null;
}

/** The brand's record of a creator, created on first use (shared demo creators start without one). */
async function ensureLink(db: Db, org: string, creatorId: string, userId: string, source: string) {
  const existing = await link(db, org, creatorId);
  if (existing) return existing;
  const [row] = await db.insert(brandCreator).values({ brandOrganizationId: org, creatorId, source, addedBy: userId }).returning();
  return row;
}

async function mergeProvenance(db: Db, org: string, creatorId: string, patch: RosterProvenance) {
  const row = await link(db, org, creatorId);
  if (!row) return;
  await db
    .update(brandCreator)
    .set({ provenance: { ...(row.provenance as RosterProvenance), ...patch } })
    .where(and(eq(brandCreator.brandOrganizationId, org), eq(brandCreator.creatorId, creatorId)));
}

/** Creators already in this brand's roster with the same Instagram handle or Qloo person. */
async function findExisting(db: Db, org: string, match: { instagram?: string | null; personId?: string | null; name?: string }) {
  const links = await db.select({ creatorId: brandCreator.creatorId }).from(brandCreator).where(eq(brandCreator.brandOrganizationId, org));
  if (links.length === 0) return null;
  const rows = await db.select().from(creator).where(inArray(creator.id, links.map((l) => l.creatorId)));
  return (
    rows.find(
      (c) =>
        (match.personId && c.qlooPersonId === match.personId) ||
        (match.instagram && (c.handles as { instagram?: string }).instagram === match.instagram) ||
        (match.name && !match.instagram && c.displayName.toLowerCase() === match.name.toLowerCase()),
    ) ?? null
  );
}

/** Look the creator up in Qloo and store what it returns. A failed lookup leaves them unmatched. */
export async function matchInQloo(db: Db, qloo: QlooApi, org: string, creatorId: string) {
  const [c] = await db.select().from(creator).where(eq(creator.id, creatorId));
  if (!c) return null;
  try {
    const found = await matchPerson(qloo, { name: c.displayName, instagram: (c.handles as { instagram?: string }).instagram });
    await db
      .update(creator)
      .set({ qlooPersonId: found?.personId ?? null, qlooProfile: found ? found.profile : { matchedVia: null, checkedAt: now() } })
      .where(eq(creator.id, creatorId));
    if (found?.profile.audience) await mergeProvenance(db, org, creatorId, { audience: { by: QLOO_AUDIENCE, at: now() } });
    return found;
  } catch (err) {
    console.warn(`roster: Qloo match skipped for ${creatorId} (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

export async function addCreator(db: Db, qloo: QlooApi, org: string, userId: string, input: RosterInput, source: "manual" | "import") {
  const name = input.name.trim();
  if (!name) throw new RosterError("Add the creator's name.");
  const existing = await findExisting(db, org, { instagram: input.instagram, name });
  if (existing) return { creatorId: existing.id, status: "exists" as const, matched: Boolean(existing.qlooPersonId) };

  const by = await userName(db, userId);
  const at = now();
  const [c] = await db
    .insert(creator)
    .values({
      organizationId: org,
      isDemo: false,
      displayName: name,
      city: input.city ?? "",
      country: input.country ?? "",
      languages: input.languages ?? [],
      modes: input.modes ?? [],
      availability: input.availability ? { status: input.availability, checkedAt: at } : {},
      handles: Object.fromEntries(Object.entries({ instagram: input.instagram, tiktok: input.tiktok, youtube: input.youtube }).filter(([, v]) => v)),
      contact: Object.fromEntries(Object.entries({ email: input.email, manager: input.manager }).filter(([, v]) => v)),
    })
    .returning({ id: creator.id });
  await db.insert(brandCreator).values({
    brandOrganizationId: org,
    creatorId: c.id,
    source,
    preferred: input.preferred ?? false,
    notes: input.notes ?? "",
    addedBy: userId,
    provenance: {
      ...(input.rate ? { rate: { by, at } } : {}),
      ...(input.availability ? { availability: { by, at } } : {}),
    } satisfies RosterProvenance,
  });
  if (input.rate) {
    await db.insert(quote).values({ creatorId: c.id, ...input.rate, source: "rate_card", suppliedBy: by });
  }
  for (const item of input.portfolio ?? []) {
    await db.insert(portfolioItem).values({ creatorId: c.id, title: item.title, role: "creator", videoUrl: item.url, description: `Link supplied by ${by}.` });
  }
  const found = await matchInQloo(db, qloo, org, c.id);
  return { creatorId: c.id, status: "added" as const, matched: Boolean(found) };
}

export async function importRoster(db: Db, qloo: QlooApi, org: string, userId: string, entries: RosterInput[]) {
  const results = [];
  // One at a time: each creator may make a Qloo lookup, and the client paces requests anyway.
  for (const e of entries) results.push({ name: e.name, ...(await addCreator(db, qloo, org, userId, e, "import")) });
  return {
    added: results.filter((r) => r.status === "added").length,
    existing: results.filter((r) => r.status === "exists").length,
    matched: results.filter((r) => r.status === "added" && r.matched).length,
  };
}

/** Add a creator Qloo suggested for a campaign direction. Visible only for campaigns the brand can read. */
export async function addDiscovered(db: Db, org: string, userId: string, discoveredId: string) {
  const [d] = await db
    .select({ found: discoveredCreator, campaignOrg: campaign.organizationId, isShowcase: campaign.isShowcase, campaignId: campaign.id })
    .from(discoveredCreator)
    .innerJoin(run, eq(discoveredCreator.runId, run.id))
    .innerJoin(campaignRevision, eq(run.revisionId, campaignRevision.id))
    .innerJoin(campaign, eq(campaignRevision.campaignId, campaign.id))
    .where(eq(discoveredCreator.id, discoveredId));
  if (!d || (d.campaignOrg !== org && !d.isShowcase)) throw new RosterError("That suggestion isn't available.");
  const f = d.found;
  const existing = await findExisting(db, org, { personId: f.qlooPersonId, instagram: f.instagram });
  if (existing) return { creatorId: existing.id, campaignId: d.campaignId, status: "exists" as const };

  const profile: QlooPersonProfile = {
    name: f.name,
    occupations: f.occupations,
    description: f.description,
    popularity: null,
    instagram: f.instagram,
    audience: (f.audience as QlooPersonProfile["audience"]) ?? null,
    matchedVia: "qloo",
    checkedAt: now(),
  };
  const [c] = await db
    .insert(creator)
    .values({
      organizationId: org,
      isDemo: false,
      displayName: f.name,
      city: "",
      country: "",
      handles: f.instagram ? { instagram: f.instagram } : {},
      qlooPersonId: f.qlooPersonId,
      qlooProfile: profile,
      bio: f.description ?? "",
    })
    .returning({ id: creator.id });
  await db.insert(brandCreator).values({
    brandOrganizationId: org,
    creatorId: c.id,
    source: "qloo",
    addedBy: userId,
    provenance: f.audience ? ({ audience: { by: QLOO_AUDIENCE, at: now() } } satisfies RosterProvenance) : {},
  });
  return { creatorId: c.id, campaignId: d.campaignId, status: "added" as const };
}

export async function updateEntry(
  db: Db,
  org: string,
  userId: string,
  creatorId: string,
  patch: { preferred?: boolean; excluded?: boolean; exclusionReason?: string | null; notes?: string },
) {
  await ensureLink(db, org, creatorId, userId, "demo");
  await db
    .update(brandCreator)
    .set({
      ...patch,
      ...(patch.excluded === false ? { exclusionReason: null } : {}),
      ...(patch.excluded ? { preferred: false } : {}),
    })
    .where(and(eq(brandCreator.brandOrganizationId, org), eq(brandCreator.creatorId, creatorId)));
}

/** Record the creator's standing rate as supplied by the team; it replaces the brand's previous one. */
export async function setRate(db: Db, org: string, userId: string, creatorId: string, rate: NonNullable<RosterInput["rate"]>) {
  const [c] = await db.select({ organizationId: creator.organizationId }).from(creator).where(eq(creator.id, creatorId));
  // Shared demo creators keep their demo rate cards; a brand only edits rates on creators it added.
  if (!c || c.organizationId !== org) throw new RosterError("Rates can be changed only for creators you added.");
  const by = await userName(db, userId);
  await db.delete(quote).where(and(eq(quote.creatorId, creatorId), isNull(quote.campaignId), eq(quote.source, "rate_card")));
  await db.insert(quote).values({ creatorId, ...rate, source: "rate_card", suppliedBy: by });
  await mergeProvenance(db, org, creatorId, { rate: { by, at: now() } });
}

export async function setAvailability(db: Db, org: string, userId: string, creatorId: string, status: "available" | "limited" | "booked") {
  const [c] = await db.select({ organizationId: creator.organizationId }).from(creator).where(eq(creator.id, creatorId));
  if (!c || c.organizationId !== org) throw new RosterError("Availability can be changed only for creators you added.");
  const at = now();
  await db.update(creator).set({ availability: { status, checkedAt: at } }).where(eq(creator.id, creatorId));
  await mergeProvenance(db, org, creatorId, { availability: { by: await userName(db, userId), at } });
}

/** Take a creator off the roster. Their past proposals keep pointing at them. */
export async function removeFromRoster(db: Db, org: string, creatorId: string) {
  await db.delete(brandCreator).where(and(eq(brandCreator.brandOrganizationId, org), eq(brandCreator.creatorId, creatorId)));
}

/** Everything the Creators page shows, for one brand. */
export async function getRoster(db: Db, org: string) {
  const links = await db.select().from(brandCreator).where(eq(brandCreator.brandOrganizationId, org));
  const [profile] = await db.select({ isDemo: orgProfile.isDemo }).from(orgProfile).where(eq(orgProfile.organizationId, org));
  const usesDemo = links.length === 0 || (profile?.isDemo ?? false);
  const own = links.length ? await db.select().from(creator).where(inArray(creator.id, links.map((l) => l.creatorId))) : [];
  const demo = usesDemo ? await db.select().from(creator).where(eq(creator.isDemo, true)) : [];
  const creators = [...new Map([...own, ...demo].map((c) => [c.id, c])).values()];
  const ids = creators.map((c) => c.id);
  const quotes = ids.length ? await db.select().from(quote).where(and(inArray(quote.creatorId, ids), isNull(quote.campaignId))) : [];
  const portfolio = ids.length ? await db.select({ id: portfolioItem.id, creatorId: portfolioItem.creatorId }).from(portfolioItem).where(inArray(portfolioItem.creatorId, ids)) : [];
  return {
    usesDemo,
    ownCount: links.filter((l) => own.some((c) => c.id === l.creatorId && !c.isDemo)).length,
    entries: creators
      .map((c) => ({
        creator: c,
        link: links.find((l) => l.creatorId === c.id) ?? null,
        quotes: quotes.filter((q) => q.creatorId === c.id).sort((a, b) => a.amountCents - b.amountCents),
        portfolioCount: portfolio.filter((p) => p.creatorId === c.id).length,
        ownedByBrand: c.organizationId === org,
      }))
      // The brand's own creators first, then the demo roster; preferred first within each.
      .sort((a, b) => Number(b.ownedByBrand) - Number(a.ownedByBrand) || Number(b.link?.preferred ?? false) - Number(a.link?.preferred ?? false) || a.creator.displayName.localeCompare(b.creator.displayName)),
  };
}

/** Qloo person IDs already on this brand's roster, to mark suggestions that have been added. */
export async function rosterPersonIds(db: Db, org: string) {
  const rows = await db
    .select({ personId: creator.qlooPersonId })
    .from(brandCreator)
    .innerJoin(creator, eq(creator.id, brandCreator.creatorId))
    .where(eq(brandCreator.brandOrganizationId, org));
  return new Set(rows.map((r) => r.personId).filter((x): x is string => Boolean(x)));
}

/** A roster problem the user can fix; its message is shown beside the form. */
export class RosterError extends Error {}
