import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { getDb, schema } from "@/db";
import { authOptions } from "./options";

function createAuth(db: Awaited<ReturnType<typeof getDb>>) {
  return betterAuth({
    ...authOptions(),
    database: drizzleAdapter(db, { provider: "pg", schema }),
  });
}

export type Auth = ReturnType<typeof createAuth>;

// The database is async (PGlite boots and migrates on first use), so the auth instance is too.
const globalForAuth = globalThis as unknown as { __commonGroundAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.__commonGroundAuth ??= getDb().then(createAuth);
  return globalForAuth.__commonGroundAuth;
}
