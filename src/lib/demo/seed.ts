// Idempotent creation of the demo users and organizations through Better Auth
// (so passwords are hashed and memberships created exactly as for real sign-ups).

import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { organization, user } from "@/db/auth-schema";
import { orgProfile } from "@/db/schema";
import type { Auth } from "@/lib/auth/create";
import { DEMO_ACCOUNTS, RETIRED_DEMO_EMAILS, type DemoRole } from "./accounts";

export type SeededAccount = { role: DemoRole; userId: string; organizationId: string; created: boolean };

export async function seedDemoIdentities(db: Db, auth: Auth, password: string): Promise<SeededAccount[]> {
  if (password.length < 8) throw new Error("DEMO_PASSWORD must be at least 8 characters");
  const seeded: SeededAccount[] = [];
  // Sessions and memberships go with the user (cascade); the creator's roster profile stays.
  await db.delete(user).where(inArray(user.email, RETIRED_DEMO_EMAILS));

  for (const role of Object.keys(DEMO_ACCOUNTS) as DemoRole[]) {
    const account = DEMO_ACCOUNTS[role];
    let created = false;

    let [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.user.email)).limit(1);
    if (!u) {
      const res = await auth.api.signUpEmail({ body: { ...account.user, password } });
      u = { id: res.user.id };
      created = true;
    }

    let [o] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, account.organization.slug))
      .limit(1);
    if (!o) {
      const res = await auth.api.createOrganization({
        body: { name: account.organization.name, slug: account.organization.slug, userId: u.id },
      });
      if (!res) throw new Error(`Could not create organization ${account.organization.slug}`);
      o = { id: res.id };
      created = true;
    }

    await db
      .insert(orgProfile)
      .values({ organizationId: o.id, kind: account.organization.kind, isDemo: true })
      .onConflictDoUpdate({ target: orgProfile.organizationId, set: { kind: account.organization.kind, isDemo: true } });

    seeded.push({ role, userId: u.id, organizationId: o.id, created });
  }
  return seeded;
}
