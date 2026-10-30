// A hard cap on total Claude API spend. The deployed app runs on one shared API key, so every model call
// reserves its worst-case cost before it is sent and settles to the billed cost from `usage` afterwards.
// A reservation that would push the total past the cap is refused, so concurrent calls cannot overshoot it.
// The check is one INSERT … ON CONFLICT DO UPDATE … WHERE statement: atomic on Neon HTTP and PGlite, no transaction.

import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { llmSpend } from "@/db/schema";

const DEFAULT_BUDGET_USD = 5;
const LEDGER = "global";
const MICROS_PER_USD = 1_000_000;

/** The cap in millionths of a dollar: LLM_BUDGET_USD, or $5. */
function budgetMicros(): number {
  const raw = process.env.LLM_BUDGET_USD;
  const usd = raw ? Number(raw) : DEFAULT_BUDGET_USD;
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`LLM_BUDGET_USD must be a non-negative number, got "${raw}"`);
  return Math.round(usd * MICROS_PER_USD);
}

const formatUsd = (micros: number) => `$${(micros / MICROS_PER_USD).toFixed(2)}`;

export class LlmBudgetError extends Error {
  constructor(readonly capMicros: number) {
    super(`The AI budget for this deployment (${formatUsd(capMicros)}) is used up, so no new model calls can run.`);
    this.name = "LlmBudgetError";
  }
}

// Claude Haiku 5.5 list prices, USD per million tokens (platform.claude.com/docs/en/about-claude/pricing, 2026-10-30).
// A request whose prompt (input + cache reads + cache writes) is over 100K tokens pays the long-prompt card.
// USD per MTok equals micro-dollars per token, so these multiply token counts directly.
const SHORT = { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 };
const LONG = { input: 0.5, cacheWrite: 0.625, cacheRead: 0.05, output: 2.5 };
const LONG_PROMPT_TOKENS = 100_000;
const WEB_SEARCH_MICROS = 10_000; // $10 per 1,000 searches

export type MeteredUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

/** What one response was billed, from its usage block. */
export function costMicros(u: MeteredUsage): number {
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const rate = u.input_tokens + read + write > LONG_PROMPT_TOKENS ? LONG : SHORT;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return Math.ceil(u.input_tokens * rate.input + write * rate.cacheWrite + read * rate.cacheRead + u.output_tokens * rate.output + searches * WEB_SEARCH_MICROS);
}

/**
 * An upper bound for one request before it is sent: every prompt token priced as a cache write
 * (the dearest input rate), at roughly two characters per token, plus a full max_tokens of output.
 * `extraTokens` covers input the caller cannot see yet (rendered schema, search results).
 */
export function worstCaseMicros(req: { promptChars: number; maxTokens: number; extraTokens?: number; searches?: number }): number {
  const promptTokens = Math.ceil(req.promptChars / 2) + (req.extraTokens ?? 0);
  const rate = promptTokens > LONG_PROMPT_TOKENS ? LONG : SHORT;
  return Math.ceil(promptTokens * rate.cacheWrite + req.maxTokens * rate.output + (req.searches ?? 0) * WEB_SEARCH_MICROS);
}

/** Holds `micros` against the cap, or throws LlmBudgetError if that would exceed it. */
export async function reserve(db: Db, micros: number, cap = budgetMicros()): Promise<void> {
  if (micros > cap) throw new LlmBudgetError(cap);
  const rows = await db
    .insert(llmSpend)
    .values({ id: LEDGER, spentMicros: micros })
    .onConflictDoUpdate({
      target: llmSpend.id,
      set: { spentMicros: sql`"llm_spend"."spent_micros" + excluded.spent_micros`, updatedAt: new Date() },
      setWhere: sql`"llm_spend"."spent_micros" + excluded.spent_micros <= ${cap}`,
    })
    .returning({ spent: llmSpend.spentMicros });
  if (rows.length === 0) throw new LlmBudgetError(cap);
}

/** Replaces a reservation with what the call actually cost (0 when the API rejected it unbilled). */
export async function settle(db: Db, reservedMicros: number, actualMicros: number): Promise<void> {
  const delta = actualMicros - reservedMicros;
  if (delta === 0) return;
  await db
    .update(llmSpend)
    .set({ spentMicros: sql`greatest(0, ${llmSpend.spentMicros} + ${delta})`, updatedAt: new Date() })
    .where(eq(llmSpend.id, LEDGER));
}

/** Spend recorded so far, including calls in flight at their reserved amount. */
export async function spentMicros(db: Db): Promise<number> {
  const [row] = await db.select({ spent: llmSpend.spentMicros }).from(llmSpend).where(eq(llmSpend.id, LEDGER));
  return row?.spent ?? 0;
}
