// Transport for the Qloo hackathon API: auth, query encoding, bounded retry,
// response caching and a provenance record for every call.
// Framework-free so seed scripts and tests can use it; Next.js wiring lives in ./server.ts.

import { createHash, randomUUID } from "node:crypto";

export type ParamValue = string | number | boolean | readonly string[] | undefined | null;
export type QlooParams = Record<string, ParamValue>;

export type QlooErrorCode =
  | "QLOO_AUTH"
  | "QLOO_FORBIDDEN"
  | "QLOO_BAD_REQUEST"
  | "QLOO_NOT_FOUND"
  | "QLOO_RATE_LIMIT"
  | "QLOO_UPSTREAM"
  | "QLOO_TIMEOUT"
  | "QLOO_NETWORK";

export type QlooError = { code: QlooErrorCode; message: string; retryable: boolean };

/** One row of provenance: what was asked, how it went. Never contains the key. */
export type QlooCallRecord = {
  id: string;
  endpoint: string;
  params: Record<string, string>;
  status: "ok" | "empty" | "error";
  httpStatus?: number;
  latencyMs: number;
  cached: boolean;
  cacheKey: string;
  error?: QlooError;
  at: string;
};

export type QlooResult<T> =
  | { status: "ok" | "empty"; data: T; call: QlooCallRecord }
  | { status: "error"; data: T; call: QlooCallRecord; error: QlooError };

/** Stores *trimmed* responses. Must be private: Qloo data may not be published. */
export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export class MemoryCache implements QlooCache {
  private store = new Map<string, unknown>();
  async get(key: string) {
    return this.store.get(key);
  }
  async set(key: string, value: unknown) {
    this.store.set(key, value);
  }
}

export type QlooClientOptions = {
  apiKey: string;
  baseUrl: string;
  cache?: QlooCache;
  onCall?: (record: QlooCallRecord) => void | Promise<void>;
  timeoutMs?: number;
  /** Retries for transient failures (5xx, network, timeout). */
  maxRetries?: number;
  /** Extra attempts after HTTP 429, each waiting for Qloo's stated reset. */
  maxRateLimitRetries?: number;
  /** Request pacing, shared by every client in the process for the same base URL. Qloo allows 10/s. */
  requestsPerSecond?: number;
  fetchImpl?: typeof fetch;
};

/** Qloo takes lists as comma-separated values; booleans as "true"/"false". */
export function encodeParams(params: QlooParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out[key] = v.join(",");
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

export function cacheKeyFor(endpoint: string, encoded: Record<string, string>): string {
  return createHash("sha256").update(endpoint).update("\n").update(JSON.stringify(encoded)).digest("hex");
}

function errorFor(httpStatus: number, body: string): QlooError {
  const detail = body.slice(0, 300);
  switch (true) {
    case httpStatus === 401:
      return { code: "QLOO_AUTH", message: `Qloo rejected the API key (401). ${detail}`, retryable: false };
    case httpStatus === 403:
      return { code: "QLOO_FORBIDDEN", message: `Not permitted for this key, often an unsupported entity type (403). ${detail}`, retryable: false };
    case httpStatus === 404:
      return { code: "QLOO_NOT_FOUND", message: `Unknown Qloo path (404). ${detail}`, retryable: false };
    case httpStatus === 429:
      return { code: "QLOO_RATE_LIMIT", message: "Qloo rate limit reached (429).", retryable: true };
    case httpStatus >= 500:
      return { code: "QLOO_UPSTREAM", message: `Qloo server error (${httpStatus}).`, retryable: true };
    default:
      return { code: "QLOO_BAD_REQUEST", message: `Qloo rejected the request (${httpStatus}). ${detail}`, retryable: false };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Process-wide pacing per base URL: each request reserves the next free slot, so concurrent
// callers (parallel pipeline stages, several QlooClient instances) stay under Qloo's per-second limit.
const nextSlotAt = new Map<string, number>();

async function acquireSlot(key: string, requestsPerSecond: number) {
  const interval = 1000 / requestsPerSecond;
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt.get(key) ?? 0);
  nextSlotAt.set(key, slot + interval);
  if (slot > now) await sleep(slot - now);
}

/** Seconds until Qloo's per-second window resets (x-second-ratelimit-reset), as milliseconds. */
function rateLimitResetMs(res: Response): number {
  const reset = Number(res.headers.get("x-second-ratelimit-reset") ?? res.headers.get("retry-after"));
  return Number.isFinite(reset) && reset > 0 ? Math.min(reset, 10) * 1000 : 1000;
}

export class QlooClient {
  private readonly opts: Required<Omit<QlooClientOptions, "onCall" | "cache">> &
    Pick<QlooClientOptions, "onCall" | "cache">;

  constructor(options: QlooClientOptions) {
    if (!options.apiKey) throw new Error("QlooClient: apiKey is required");
    this.opts = {
      timeoutMs: 30_000,
      maxRetries: 2,
      maxRateLimitRetries: 5,
      requestsPerSecond: 8,
      fetchImpl: fetch,
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
    };
  }

  /**
   * GET an endpoint and trim the JSON. `isEmpty` decides ok vs empty on the trimmed value.
   * Only successful, trimmed results are cached.
   */
  async get<T>(
    endpoint: string,
    params: QlooParams,
    trim: (raw: unknown) => T,
    isEmpty: (data: T) => boolean,
  ): Promise<QlooResult<T>> {
    const encoded = encodeParams(params);
    const cacheKey = cacheKeyFor(endpoint, encoded);
    const started = Date.now();
    const base = { id: randomUUID(), endpoint, params: encoded, cacheKey, at: new Date().toISOString() };

    const hit = this.opts.cache ? await this.opts.cache.get(cacheKey) : undefined;
    if (hit !== undefined) {
      const data = hit as T;
      const status = isEmpty(data) ? "empty" : "ok";
      return this.finish({ status, data, call: { ...base, status, latencyMs: Date.now() - started, cached: true } });
    }

    const url = `${this.opts.baseUrl}${endpoint}?${new URLSearchParams(encoded).toString()}`;
    let lastError: QlooError | undefined;
    let httpStatus: number | undefined;

    let rateLimited = 0;
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1) + Math.random() * 250);
      try {
        await acquireSlot(this.opts.baseUrl, this.opts.requestsPerSecond);
        const res = await this.opts.fetchImpl(url, {
          headers: { "X-Api-Key": this.opts.apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        httpStatus = res.status;
        if (res.status === 429 && rateLimited < this.opts.maxRateLimitRetries) {
          // Wait for the window Qloo reports, without spending a transient-failure retry.
          rateLimited++;
          await res.body?.cancel();
          await sleep(rateLimitResetMs(res) + Math.random() * 250);
          attempt--;
          continue;
        }
        if (!res.ok) {
          lastError = errorFor(res.status, await res.text().catch(() => ""));
          if (lastError.retryable) continue;
          break;
        }
        const data = trim(await res.json());
        const status = isEmpty(data) ? "empty" : "ok";
        if (this.opts.cache) await this.opts.cache.set(cacheKey, data);
        return this.finish({
          status,
          data,
          call: { ...base, status, httpStatus, latencyMs: Date.now() - started, cached: false },
        });
      } catch (err) {
        const timedOut = err instanceof DOMException && err.name === "TimeoutError";
        lastError = timedOut
          ? { code: "QLOO_TIMEOUT", message: `Qloo did not respond within ${this.opts.timeoutMs} ms.`, retryable: true }
          : { code: "QLOO_NETWORK", message: `Could not reach Qloo: ${(err as Error).message}`, retryable: true };
      }
    }

    const error = lastError ?? { code: "QLOO_NETWORK" as const, message: "Unknown Qloo failure.", retryable: false };
    return this.finish({
      status: "error",
      data: trim({}),
      error,
      call: { ...base, status: "error", httpStatus, latencyMs: Date.now() - started, cached: false, error },
    });
  }

  private async finish<T>(result: QlooResult<T>): Promise<QlooResult<T>> {
    if (this.opts.onCall) {
      try {
        await this.opts.onCall(result.call);
      } catch {
        // provenance logging must never break a request
      }
    }
    return result;
  }
}
