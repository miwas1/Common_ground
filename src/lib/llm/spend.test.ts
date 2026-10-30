import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openPglite, type Db } from "@/db";
import { llmSpend } from "@/db/schema";
import { costMicros, LlmBudgetError, reserve, settle, spentMicros, worstCaseMicros } from "./spend";

describe("cost", () => {
  it("prices a short prompt on Haiku 5.5's standard card", () => {
    // 10K in × $0.10 + 2K cache write × $0.125 + 50K cache read × $0.01 + 3K out × $0.50 + 2 searches × $0.01 (per MTok)
    const u = { input_tokens: 10_000, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 50_000, output_tokens: 3_000, server_tool_use: { web_search_requests: 2 } };
    expect(costMicros(u)).toBe(1_000 + 250 + 500 + 1_500 + 20_000);
  });

  it("prices a prompt over 100K tokens, cache reads included, on the long-prompt card", () => {
    expect(costMicros({ input_tokens: 1_000, cache_read_input_tokens: 100_000, output_tokens: 1_000 })).toBe(500 + 5_000 + 2_500);
  });

  it("estimates no less than the call can be billed", () => {
    const worst = worstCaseMicros({ promptChars: 40_000, maxTokens: 16_000, extraTokens: 4_000 });
    // 40K characters is at most ~20K tokens; billed with every token at its dearest rate.
    expect(worst).toBeGreaterThanOrEqual(costMicros({ input_tokens: 0, cache_creation_input_tokens: 24_000, output_tokens: 16_000 }));
  });
});

describe("spend cap", { timeout: 30_000 }, () => {
  let db: Db;

  beforeAll(async () => {
    db = await openPglite("memory://");
  });

  beforeEach(async () => {
    await db.delete(llmSpend);
  });

  it("reserves, then settles to the billed cost", async () => {
    await reserve(db, 5_000, 1_000_000);
    expect(await spentMicros(db)).toBe(5_000);
    await settle(db, 5_000, 1_200);
    expect(await spentMicros(db)).toBe(1_200);
  });

  it("refuses a reservation that would pass the cap and leaves the total unchanged", async () => {
    await reserve(db, 900, 1_000);
    await expect(reserve(db, 200, 1_000)).rejects.toBeInstanceOf(LlmBudgetError);
    expect(await spentMicros(db)).toBe(900);
    await reserve(db, 100, 1_000);
    expect(await spentMicros(db)).toBe(1_000);
  });

  it("refuses a first call larger than the whole cap", async () => {
    await expect(reserve(db, 2_000, 1_000)).rejects.toBeInstanceOf(LlmBudgetError);
    expect(await spentMicros(db)).toBe(0);
  });

  it("never lets concurrent reservations exceed the cap", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => reserve(db, 100, 1_000)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await spentMicros(db)).toBe(1_000);
  });
});
