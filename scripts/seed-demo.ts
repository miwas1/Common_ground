// Seed demo accounts and the fictional creator roster: `pnpm db:seed`.
// Roster references and themes are resolved through Qloo (responses cached privately in the database).
// Locally this writes to ./.pglite: stop `pnpm dev` first (PGlite allows one process per data directory).
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env.local (see .env.example)");
  const qlooKey = process.env.QLOO_API_KEY;
  if (!qlooKey) throw new Error("Set QLOO_API_KEY in .env.local");

  const { getDb } = await import("@/db");
  const { createAuth } = await import("@/lib/auth/create");
  const { seedDemoIdentities } = await import("@/lib/demo/seed");
  const { seedRoster } = await import("@/lib/demo/roster-seed");
  const { QlooApi } = await import("@/lib/qloo/api");
  const { QlooClient } = await import("@/lib/qloo/client");
  const { DbCache, recordCall } = await import("@/lib/qloo/db-cache");

  const { ensureExampleProfile } = await import("@/lib/demo/example-research");
  const db = await getDb();
  for (const s of await seedDemoIdentities(db, createAuth(db), password)) {
    console.log(`${s.role.padEnd(8)} ${s.created ? "created" : "exists "}  user=${s.userId}  org=${s.organizationId}`);
    if (s.role === "brand" && (await ensureExampleProfile(db, s.organizationId))) console.log("         example brand profile added");
  }

  const api = new QlooApi(
    new QlooClient({
      apiKey: qlooKey,
      baseUrl: process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com",
      cache: new DbCache(db),
      onCall: recordCall(db),
    }),
  );
  const report = await seedRoster(db, api);
  console.log(`roster   created ${report.created.length}, already present ${report.skipped.length}`);
  for (const u of report.unresolved) {
    const hint = u.candidates.length ? `candidates: ${u.candidates.slice(0, 4).join(" | ")}` : "no candidates";
    console.log(`  unresolved ${u.kind} "${u.label}" (${u.creator}, ${u.status}) ${hint}`);
  }
}

// Close PGlite before exiting: leaving it open can corrupt .pglite (a no-op with Neon).
const closeDb = () => import("@/db").then(({ closeLocalDb }) => closeLocalDb());

main().then(
  () => closeDb().finally(() => process.exit(0)),
  (err) => {
    console.error(err);
    closeDb().finally(() => process.exit(1));
  },
);
