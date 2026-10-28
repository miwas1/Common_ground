import "server-only";

import { getDb } from "@/db";
import { serverEnv } from "@/lib/env";
import { QlooApi } from "./api";
import { QlooClient } from "./client";
import { DbCache, recordCall } from "./db-cache";

/**
 * Qloo access for server code. Calls are cached privately in Postgres (PGlite locally,
 * Neon in production) and, when a campaign is given, logged as provenance for its evidence drawer.
 */
export function qlooFor(campaignId?: string, runId?: string): QlooApi {
  const env = serverEnv();
  const db = getDb();
  const client = new QlooClient({
    apiKey: env.QLOO_API_KEY,
    baseUrl: env.QLOO_BASE_URL,
    cache: new DbCache(db),
    onCall: recordCall(db, campaignId, runId),
  });
  return new QlooApi(client);
}
