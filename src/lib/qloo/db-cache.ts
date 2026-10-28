import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { qlooCache, qlooCall } from "@/db/schema";
import type { QlooCache, QlooCallRecord } from "./client";

type DbSource = Db | Promise<Db>;

/** Postgres-backed private cache of trimmed Qloo responses. */
export class DbCache implements QlooCache {
  constructor(private readonly db: DbSource) {}

  async get(key: string) {
    const db = await this.db;
    const rows = await db
      .select({ response: qlooCache.response })
      .from(qlooCache)
      .where(eq(qlooCache.cacheKey, key))
      .limit(1);
    return rows[0]?.response;
  }

  async set(key: string, value: unknown) {
    const db = await this.db;
    await db
      .insert(qlooCache)
      .values({ cacheKey: key, response: value })
      .onConflictDoUpdate({ target: qlooCache.cacheKey, set: { response: value } });
  }
}

/** Persist a provenance record, optionally attributed to a campaign. */
export function recordCall(source: DbSource, campaignId?: string) {
  return async (call: QlooCallRecord) => {
    const db = await source;
    await db.insert(qlooCall).values({
      id: call.id,
      campaignId: campaignId ?? null,
      endpoint: call.endpoint,
      params: call.params,
      status: call.status,
      httpStatus: call.httpStatus ?? null,
      latencyMs: call.latencyMs,
      cached: call.cached,
      cacheKey: call.cacheKey,
      error: call.error ?? null,
    });
  };
}
