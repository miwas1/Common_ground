import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { member } from "@/db/auth-schema";
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

  it("creates a brand and a creator account that can sign in, and is idempotent", async () => {
    const auth = createAuth(db);
    const first = await seedDemoIdentities(db, auth, "demo-password-123");
    const second = await seedDemoIdentities(db, auth, "demo-password-123");

    expect(first.map((s) => s.created)).toEqual([true, true]);
    expect(second.map((s) => s.created)).toEqual([false, false]);
    expect(second.map((s) => s.organizationId)).toEqual(first.map((s) => s.organizationId));

    const [brand, creator] = first;
    const profiles = await db.select().from(orgProfile);
    expect(profiles.find((p) => p.organizationId === brand.organizationId)?.kind).toBe("brand");
    expect(profiles.find((p) => p.organizationId === creator.organizationId)?.kind).toBe("creator");
    expect(await db.select().from(member).where(eq(member.userId, brand.userId))).toHaveLength(1);

    const signIn = await auth.api.signInEmail({ body: { email: "maya.l@example.com", password: "demo-password-123" } });
    expect(signIn.user.id).toBe(creator.userId);

    // The demo creator cannot see the demo brand's campaigns.
    const { campaignId } = await createCampaign(db, { organizationId: brand.organizationId, userId: brand.userId });
    await expect(authorize(db, { userId: creator.userId }, { type: "campaign.read", campaignId })).rejects.toThrow();
    await authorize(db, { userId: brand.userId }, { type: "campaign.write", campaignId });
  });
});
