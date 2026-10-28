// One Postgres schema, two drivers:
// - production: Neon over HTTP, selected by DATABASE_URL
// - local dev and tests: embedded PGlite (Postgres in WASM), migrated automatically
// Both are Postgres, so schema, migrations and queries are identical.

import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

/** App tables plus Better Auth identity tables (generated: `pnpm auth:generate`). */
const schema = { ...appSchema, ...authSchema };

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** "memory://" for an ephemeral database; otherwise a directory path. */
export function pgliteDataDir(): string {
  return process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".pglite");
}

async function connectNeon(url: string): Promise<Db> {
  const { drizzle } = await import("drizzle-orm/neon-http");
  return drizzle({ connection: url, schema });
}

async function connectPglite(dataDir: string): Promise<Db> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const db = drizzle({ client: new PGlite(dataDir), schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

// Kept on globalThis so dev hot reloads reuse one PGlite instance per data directory.
const globalForDb = globalThis as unknown as { __commonGroundDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__commonGroundDb) {
    const url = process.env.DATABASE_URL;
    if (!url && process.env.VERCEL) {
      throw new Error("DATABASE_URL must be set in deployed environments (PGlite is local-only).");
    }
    const connecting = url ? connectNeon(url) : connectPglite(pgliteDataDir());
    // Don't cache a failed connection; the next call retries.
    globalForDb.__commonGroundDb = connecting.catch((err) => {
      globalForDb.__commonGroundDb = undefined;
      throw err;
    });
  }
  return globalForDb.__commonGroundDb;
}

/** Open an isolated database (tests). Not shared through the global singleton. */
export function openPglite(dataDir = "memory://"): Promise<Db> {
  return connectPglite(dataDir);
}

export { schema };
