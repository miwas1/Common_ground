import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { openPglite, type Db } from "@/db";
import { member, user } from "@/db/auth-schema";
import { orgProfile } from "@/db/schema";
import { createAuth, type Auth } from "@/lib/auth/create";

let db: Db;
let auth: Auth;

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("@/db", async (orig) => ({ ...(await orig<typeof import("@/db")>()), getDb: async () => db }));
vi.mock("@/lib/auth/server", () => ({ getAuth: async () => auth }));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("signUpWithEmail", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    db = await openPglite("memory://");
    auth = createAuth(db);
  });

  it("creates the user and a brand organization they belong to, then opens the app", async () => {
    const { signUpWithEmail } = await import("./actions");
    const fields = { name: "Sam Okafor", brand: "Fern & Field", email: "sam@example.test", password: "a-long-password" };
    await expect(signUpWithEmail(undefined, form(fields))).rejects.toMatchObject({ to: "/brand" });

    const [u] = await db.select().from(user).where(eq(user.email, "sam@example.test"));
    const memberships = await db
      .select({ kind: orgProfile.kind })
      .from(member)
      .innerJoin(orgProfile, eq(orgProfile.organizationId, member.organizationId))
      .where(eq(member.userId, u.id));
    expect(memberships).toEqual([{ kind: "brand" }]);

    // A second sign-up with the same email is refused with a message, not an exception.
    expect(await signUpWithEmail(undefined, form(fields))).toEqual({ error: expect.stringContaining("already be registered") });
  });

  it("rejects short passwords and missing fields before creating anything", async () => {
    const { signUpWithEmail } = await import("./actions");
    expect(await signUpWithEmail(undefined, form({ name: "A", brand: "B", email: "a@example.test", password: "short" }))).toEqual({ error: expect.any(String) });
    expect(await signUpWithEmail(undefined, form({ name: "", brand: "B", email: "a@example.test", password: "a-long-password" }))).toEqual({ error: expect.any(String) });
    expect(await db.select().from(user).where(eq(user.email, "a@example.test"))).toEqual([]);
  });
});
