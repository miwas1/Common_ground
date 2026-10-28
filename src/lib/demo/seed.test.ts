import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { member, user } from "@/db/auth-schema";
import { orgProfile } from "@/db/schema";
import { authorize } from "@/lib/auth/authorize";
import { createAuth } from "@/lib/auth/create";
import { createCampaign } from "@/test/fixtures";
import { seedDemoIdentities } from "./seed";

describe("demo identity seed", { timeout: 60_000 }, () => {
  let db: Db;

  beforeAll(async () => {
    db = await openPglite("memory://");
  });

  it("creates the demo brand account that can sign in, and is idempotent", async () => {
    const auth = createAuth(db);
    const first = await seedDemoIdentities(db, auth, "demo-password-123");
    const second = await seedDemoIdentities(db, auth, "demo-password-123");

    expect(first.map((s) => [s.role, s.created])).toEqual([["brand", true]]);
    expect(second.map((s) => s.created)).toEqual([false]);
    expect(second[0].organizationId).toBe(first[0].organizationId);

    const [brand] = first;
    const [profile] = await db.select().from(orgProfile).where(eq(orgProfile.organizationId, brand.organizationId));
    expect(profile.kind).toBe("brand");
    expect(await db.select().from(member).where(eq(member.userId, brand.userId))).toHaveLength(1);

    const signIn = await auth.api.signInEmail({ body: { email: "alex.rivera@example.com", password: "demo-password-123" } });
    expect(signIn.user.id).toBe(brand.userId);

    const { campaignId } = await createCampaign(db, { organizationId: brand.organizationId, userId: brand.userId });
    await authorize(db, { userId: brand.userId }, { type: "campaign.write", campaignId });
  });

  it("removes the creator login that earlier deploys seeded", async () => {
    const auth = createAuth(db);
    await auth.api.signUpEmail({ body: { name: "Maya L.", email: "maya.l@example.com", password: "demo-password-123" } });
    await seedDemoIdentities(db, auth, "demo-password-123");
    expect(await db.select().from(user).where(eq(user.email, "maya.l@example.com"))).toEqual([]);
  });
});
