import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { member } from "@/db/auth-schema";
import { orgProfile } from "@/db/schema";

/**
 * The brand organization the actor is working in: their active org if it is a brand they belong to,
 * otherwise their first brand org. Always derived from membership, never from the request.
 */
export async function actingBrandOrg(userId: string, activeOrganizationId: string | null) {
  const db = await getDb();
  const orgs = await db
    .select({ id: member.organizationId, kind: orgProfile.kind })
    .from(member)
    .innerJoin(orgProfile, eq(orgProfile.organizationId, member.organizationId))
    .where(and(eq(member.userId, userId), eq(orgProfile.kind, "brand")));
  return orgs.find((o) => o.id === activeOrganizationId)?.id ?? orgs[0]?.id ?? null;
}
