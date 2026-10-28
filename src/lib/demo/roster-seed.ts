// Seeds the fictional demo roster (./roster.ts). Idempotent: creators that already exist are skipped,
// so past runs that reference their portfolio items are never disturbed (use `pnpm db:reset` to rebuild).
// References and themes are resolved through Qloo here; only exact, unambiguous matches are confirmed.

import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { organization } from "@/db/auth-schema";
import { creator, creatorReference, creatorTheme, orgProfile, portfolioItem, quote } from "@/db/schema";
import type { QlooApi } from "@/lib/qloo/api";
import { resolveEntity, resolveTheme, type Resolution } from "@/lib/qloo/resolve";
import { DEMO_ACCOUNTS } from "./accounts";
import { ROSTER, type RosterCreator } from "./roster";

const QUOTE_VALIDITY_DAYS = 60;

export type RosterSeedReport = {
  created: string[];
  skipped: string[];
  unresolved: { creator: string; label: string; kind: "reference" | "theme"; status: Resolution["status"]; candidates: string[] }[];
};

async function findOrgBySlug(db: Db, slug: string) {
  const [o] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1);
  return o?.id;
}

/** Roster-only creators get an organization without members: they appear in casting but cannot sign in. */
async function ensureCreatorOrg(db: Db, c: RosterCreator): Promise<string> {
  if (c.account) {
    const id = await findOrgBySlug(db, DEMO_ACCOUNTS[c.account].organization.slug);
    if (!id) throw new Error(`Seed demo identities before the roster (missing ${c.account} account)`);
    return id;
  }
  const slug = `demo-creator-${c.slug}`;
  const existing = await findOrgBySlug(db, slug);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.insert(organization).values({ id, name: `${c.displayName} (demo)`, slug, createdAt: new Date() });
  await db.insert(orgProfile).values({ organizationId: id, kind: "creator", isDemo: true });
  return id;
}

export async function seedRoster(db: Db, api: QlooApi, roster: RosterCreator[] = ROSTER): Promise<RosterSeedReport> {
  const report: RosterSeedReport = { created: [], skipped: [], unresolved: [] };
  const validUntil = new Date(Date.now() + QUOTE_VALIDITY_DAYS * 86_400_000);

  for (const c of roster) {
    const organizationId = await ensureCreatorOrg(db, c);
    const [existing] = await db.select({ id: creator.id }).from(creator).where(eq(creator.organizationId, organizationId)).limit(1);
    if (existing) {
      report.skipped.push(c.slug);
      continue;
    }

    // Resolve before writing, so a creator is inserted with all of its references in one pass.
    const [refs, themes] = await Promise.all([
      Promise.all(c.references.map((r) => resolveEntity(api, r.label, r.type))),
      Promise.all(c.themes.map((t) => resolveTheme(api, t))),
    ]);

    const [row] = await db
      .insert(creator)
      .values({
        organizationId,
        isDemo: true,
        displayName: c.displayName,
        city: c.city,
        country: c.country,
        languages: c.languages,
        modes: c.modes,
        bio: c.bio,
        proposition: c.proposition,
        availability: c.availability,
        declinedCategories: c.declinedCategories,
        audienceStats: c.audience
          ? { ...c.audience, source: "self-reported", asOf: new Date().toISOString().slice(0, 10) }
          : null,
      })
      .returning({ id: creator.id });

    await db.insert(portfolioItem).values(c.portfolio.map((p) => ({ creatorId: row.id, ...p })));
    await db.insert(quote).values(
      c.quotes.map((q) => ({
        creatorId: row.id,
        package: q.package,
        amountCents: Math.round(q.amount * 100),
        currency: q.currency,
        usageTerms: q.usageTerms,
        validUntil,
        source: "rate_card",
      })),
    );
    await db.insert(creatorReference).values(
      c.references.map((r, i) => {
        const res = refs[i];
        return {
          creatorId: row.id,
          label: r.label,
          qlooId: res.status === "confirmed" ? res.id : null,
          qlooType: r.type,
          confirmed: res.status === "confirmed",
        };
      }),
    );
    await db.insert(creatorTheme).values(
      c.themes.map((label, i) => {
        const res = themes[i];
        return { creatorId: row.id, label, tagId: res.status === "confirmed" ? res.id : null, confirmed: res.status === "confirmed" };
      }),
    );

    c.references.forEach((r, i) => {
      const res = refs[i];
      if (res.status !== "confirmed") {
        report.unresolved.push({ creator: c.slug, label: r.label, kind: "reference", status: res.status, candidates: res.candidates.map((x) => x.name) });
      }
    });
    c.themes.forEach((label, i) => {
      const res = themes[i];
      if (res.status !== "confirmed") {
        report.unresolved.push({ creator: c.slug, label, kind: "theme", status: res.status, candidates: res.candidates.map((x) => x.name) });
      }
    });
    report.created.push(c.slug);
  }
  return report;
}
