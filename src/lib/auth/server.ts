import "server-only";

import { getDb } from "@/db";
import { createAuth, type Auth } from "./create";

export type { Auth };

// The database is async (PGlite boots and migrates on first use), so the auth instance is too.
const globalForAuth = globalThis as unknown as { __commonGroundAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.__commonGroundAuth ??= getDb().then(createAuth);
  return globalForAuth.__commonGroundAuth;
}
