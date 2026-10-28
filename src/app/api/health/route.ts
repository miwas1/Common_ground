import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

/** Deployment check: which database driver is active and whether it answers. No secrets returned. */
export async function GET() {
  await connection();
  const driver = process.env.DATABASE_URL ? "neon" : "pglite";
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      db: driver,
      qlooConfigured: Boolean(process.env.QLOO_API_KEY),
      llmConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      authConfigured: Boolean(process.env.BETTER_AUTH_SECRET),
      // Research runs need Vercel's system environment variables on Vercel (Workflow reads
      // VERCEL_DEPLOYMENT_ID to pick its managed backend); locally the filesystem backend is used.
      workflowBackend: process.env.VERCEL_DEPLOYMENT_ID ? "vercel" : process.env.VERCEL ? "MISSING system env vars" : "local",
    });
  } catch (err) {
    return Response.json({ ok: false, db: driver, error: (err as Error).message }, { status: 503 });
  }
}
