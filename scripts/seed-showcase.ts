// Research the showcase campaign once with real Qloo and the real model: `pnpm db:showcase`
// (also part of `pnpm db:deploy`, so every Vercel build ensures it exists; it is skipped once done).
// A failure is reported but does not fail the deploy: the app says the showcase is being prepared.
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const qlooKey = process.env.QLOO_API_KEY;
  if (!qlooKey || !process.env.ANTHROPIC_API_KEY) {
    console.warn("showcase  skipped: QLOO_API_KEY and ANTHROPIC_API_KEY are needed");
    return;
  }
  const { getDb } = await import("@/db");
  const { seedShowcase } = await import("@/lib/demo/showcase");
  const { anthropicLlm } = await import("@/lib/llm");
  const { QlooApi } = await import("@/lib/qloo/api");
  const { QlooClient } = await import("@/lib/qloo/client");
  const { DbCache, recordCall } = await import("@/lib/qloo/db-cache");

  const db = await getDb();
  const qlooFor = (campaignId: string, runId: string) =>
    new QlooApi(
      new QlooClient({
        apiKey: qlooKey,
        baseUrl: process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com",
        cache: new DbCache(db),
        onCall: recordCall(db, campaignId, runId),
      }),
    );
  console.log("showcase  checking");
  const res = await seedShowcase(db, { qlooFor, llm: anthropicLlm(), log: (l) => console.log(l) });
  console.log(`showcase  ${res.status}  campaign=${res.campaignId}`);
}

// Close PGlite before exiting: leaving it open can corrupt .pglite (a no-op with Neon).
const closeDb = () => import("@/db").then(({ closeLocalDb }) => closeLocalDb());

main().then(
  () => closeDb().finally(() => process.exit(0)),
  (err) => {
    console.error("showcase  NOT READY:", err instanceof Error ? err.message : err);
    closeDb().finally(() => process.exit(0));
  },
);
