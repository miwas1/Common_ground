// Test-only builders that insert identity and campaign rows directly (no auth flow).
import type { Db } from "@/db";
import { member, organization, user } from "@/db/auth-schema";
import { campaign, campaignRevision, orgProfile } from "@/db/schema";

const uid = () => crypto.randomUUID();

export async function createUser(db: Db, name = "Test User") {
  const id = uid();
  await db.insert(user).values({ id, name, email: `${id}@example.test` });
  return id;
}

export async function createOrg(
  db: Db,
  opts: { kind: "brand" | "creator"; name?: string; members?: { userId: string; role?: string }[] },
) {
  const id = uid();
  await db.insert(organization).values({ id, name: opts.name ?? `Org ${id.slice(0, 6)}`, slug: id, createdAt: new Date() });
  await db.insert(orgProfile).values({ organizationId: id, kind: opts.kind });
  for (const m of opts.members ?? []) {
    await db.insert(member).values({ id: uid(), organizationId: id, userId: m.userId, role: m.role ?? "member", createdAt: new Date() });
  }
  return id;
}

export async function createCampaign(db: Db, opts: { organizationId: string; userId?: string; isShowcase?: boolean }) {
  const [c] = await db
    .insert(campaign)
    .values({ name: "Test campaign", organizationId: opts.organizationId, isShowcase: opts.isShowcase ?? false })
    .returning();
  const [rev] = await db
    .insert(campaignRevision)
    .values({
      campaignId: c.id,
      number: 1,
      brief: {},
      campaignType: "ugc_production",
      markets: ["US"],
      languages: ["en"],
      createdBy: opts.userId ?? null,
    })
    .returning();
  return { campaignId: c.id, revisionId: rev.id };
}
