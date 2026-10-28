// Builds the Better Auth instance for a database. Used by the app (./server.ts) and by scripts.
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { schema, type Db } from "@/db";
import { authOptions } from "./options";

export function createAuth(db: Db) {
  return betterAuth({
    ...authOptions(),
    database: drizzleAdapter(db, { provider: "pg", schema }),
  });
}

export type Auth = ReturnType<typeof createAuth>;
