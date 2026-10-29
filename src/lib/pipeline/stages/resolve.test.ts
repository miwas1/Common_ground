// Name lookup when Qloo has no exact match: the model's reading of the brief decides, and the
// run only pauses for a name the brief genuinely leaves open.

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { openPglite, type Db } from "@/db";
import { organization } from "@/db/auth-schema";
import { campaign, campaignRevision, resolvedReference, run, runStage } from "@/db/schema";
import type { Llm, ObjectRequest } from "@/lib/llm";
import type { QlooApi } from "@/lib/qloo/api";
import type { StageCtx } from "../context";
import { resolveReferences } from "./resolve";

const ok = <T>(data: T) => ({ status: "ok" as const, data, call: { id: undefined } as never });

const TAGS: Record<string, string[]> = {
  forex: ["Financial Freedom", "Financial Success"],
  "day trading": ["Trading", "Active Trading", "Daily Training"],
  "night markets": ["Street Food", "Nightlife"],
};

const qloo = {
  search: async ({ query, types }: { query: string; types: string[] }) =>
    ok(query === "Ft9ja" ? [] : [{ id: `E:${query}`, name: query, type: types[0], popularity: 0.95, tags: [] }]),
  findTags: async ({ query }: { query: string }) =>
    ok((TAGS[query] ?? []).map((name) => ({ id: `T:${name}`, name, subtype: "urn:tag:lifestyle:qloo", parentTypes: [] }))),
  findAudiences: async () => ok([]),
} as unknown as QlooApi;

const prompts: string[] = [];
const llm: Llm = {
  async object<S extends z.ZodType>(req: ObjectRequest<S>): Promise<z.infer<S>> {
    prompts.push(req.prompt);
    // forex → none of these; day trading → Active Trading; night markets → ask.
    return {
      picks: [
        { ref: "R1", choice: "none" },
        { ref: "R2", choice: "R2.C2" },
        { ref: "R3", choice: "ask" },
      ],
    } as z.infer<S>;
  },
};

describe("resolveReferences with the model's reading", { timeout: 60_000 }, () => {
  let db: Db;
  let ctx: StageCtx;
  let revisionId: string;

  beforeAll(async () => {
    db = await openPglite("memory://");
    const [org] = await db.insert(organization).values({ id: "org-1", name: "Ft9ja", slug: "ft9ja", createdAt: new Date() }).returning();
    const [c] = await db.insert(campaign).values({ name: "US launch", organizationId: org.id }).returning();
    const brief = { brandName: "Ft9ja", product: { name: "Zuma trading account", description: "A funded trading account" }, objective: "Launch in the US", notes: "", deliverables: "", constraints: "" };
    const [rev] = await db.insert(campaignRevision).values({ campaignId: c.id, number: 1, brief, campaignType: "hybrid", markets: ["US"], languages: ["en"], currency: "USD" }).returning();
    revisionId = rev.id;
    const [r] = await db.insert(run).values({ revisionId, status: "running" }).returning();
    await db.insert(runStage).values([
      { runId: r.id, position: 0, name: "Understanding your brief", status: "done", output: { summary: "Ft9ja sells funded trading accounts to retail traders.", terms: [{ term: "forex", meaning: "currency trading" }], peers: [], cautions: [], sources: [], searched: false } },
      {
        runId: r.id,
        position: 1,
        name: "Reading the brief",
        status: "done",
        output: {
          references: [
            { label: "forex", kind: "interest", inputIndex: null, rationale: "" },
            { label: "day trading", kind: "interest", inputIndex: null, rationale: "" },
            { label: "night markets", kind: "interest", inputIndex: null, rationale: "" },
          ],
        },
      },
    ]);
    ctx = { db, runId: r.id, qloo, llm };
  });

  it("matches, drops or asks per name, and reports what it matched", async () => {
    const out = await resolveReferences(ctx);
    expect(out).toMatchObject({ needsInput: 1, matched: [{ from: "day trading", to: "Active Trading" }], dropped: ["forex"] });
    // The brief's meaning reaches the model alongside the candidates.
    expect(prompts[0]).toContain("currency trading");

    const refs = await db.select().from(resolvedReference).where(eq(resolvedReference.revisionId, revisionId));
    expect(refs.find((r) => r.label === "Active Trading")).toMatchObject({ status: "confirmed", qlooId: "T:Active Trading" });
    expect(refs.find((r) => r.label === "forex")).toMatchObject({ status: "rejected" });
    expect(refs.find((r) => r.label === "night markets")).toMatchObject({ status: "needs_input" });
    // The brand itself had no Qloo match at all.
    expect(refs.find((r) => r.label === "Ft9ja")).toMatchObject({ status: "rejected" });
  });
});
