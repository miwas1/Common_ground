// Apply database migrations: `pnpm db:deploy` runs this, then the demo seed (also on every Vercel build).
// With DATABASE_URL (Neon) it uses Drizzle's Neon HTTP migrator; locally, opening PGlite migrates it.
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(drizzle({ connection: url }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("migrations applied (Neon)");
  } else {
    const { getDb } = await import("@/db");
    await getDb();
    console.log("migrations applied (PGlite)");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
