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
    });
  } catch (err) {
    return Response.json({ ok: false, db: driver, error: (err as Error).message }, { status: 503 });
  }
}
