// Seed the demo brand and creator accounts: `pnpm db:seed`.
// Locally this writes to ./.pglite: stop `pnpm dev` first (PGlite allows one process per data directory).
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env.local (see .env.example)");

  const { getDb } = await import("@/db");
  const { createAuth } = await import("@/lib/auth/create");
  const { seedDemoIdentities } = await import("@/lib/demo/seed");

  const db = await getDb();
  const seeded = await seedDemoIdentities(db, createAuth(db), password);
  for (const s of seeded) {
    console.log(`${s.role.padEnd(8)} ${s.created ? "created" : "exists "}  user=${s.userId}  org=${s.organizationId}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
