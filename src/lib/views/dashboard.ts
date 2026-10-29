import "server-only";

// Read model for the campaigns dashboard: every campaign the user's organizations own, with where its
// latest research run stands and what it has produced so far.

import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { member, organization, user } from "@/db/auth-schema";
import { campaign, campaignRevision, creatorFit, direction, proposal, run, runStage } from "@/db/schema";
import type { BriefForm } from "@/lib/pipeline/context";
import { STAGES } from "@/lib/pipeline/stages";

/** What the dashboard says about a campaign, worked out from its latest run rather than the stored status alone. */
export type CampaignState = "researching" | "needs_answer" | "stopped" | "ready" | "draft";

export type DashboardCampaign = {
  id: string;
  name: string;
  brand: string;
  product: string;
  markets: string[];
  campaignType: string | null;
  budgetCents: number | null;
  currency: string;
  version: number;
  createdAt: Date;
  state: CampaignState;
  /** While researching: steps done and the step in hand. */
  progress: { done: number; total: number; current: string | null } | null;
  directions: number;
  proposals: number;
  creators: number;
};

export async function getDashboard(userId: string) {
  const db = await getDb();
  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  const orgIds = orgs.map((o) => o.id);
  const rows = orgIds.length ? await db.select().from(campaign).where(inArray(campaign.organizationId, orgIds)).orderBy(desc(campaign.createdAt)) : [];

  const revisionIds = rows.map((c) => c.currentRevisionId).filter((x): x is string => Boolean(x));
  const revisions = revisionIds.length ? await db.select().from(campaignRevision).where(inArray(campaignRevision.id, revisionIds)) : [];
  const runs = revisionIds.length
    ? await db.select().from(run).where(and(inArray(run.revisionId, revisionIds), eq(run.mode, "qloo"))).orderBy(desc(run.createdAt))
    : [];
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.revisionId)) latest.set(r.revisionId, r);
  const runIds = [...latest.values()].map((r) => r.id);

  const tally = async (table: typeof direction | typeof proposal | typeof creatorFit, extra?: ReturnType<typeof eq>) => {
    if (runIds.length === 0) return new Map<string, number>();
    const where = extra ? and(inArray(table.runId, runIds), extra) : inArray(table.runId, runIds);
    const res = await db.select({ runId: table.runId, n: count() }).from(table).where(where).groupBy(table.runId);
    return new Map(res.map((r) => [r.runId, Number(r.n)]));
  };
  const [directions, proposals, creators] = await Promise.all([tally(direction), tally(proposal), tally(creatorFit, eq(creatorFit.shortlisted, true))]);
  const stages = runIds.length ? await db.select({ runId: runStage.runId, position: runStage.position, status: runStage.status }).from(runStage).where(inArray(runStage.runId, runIds)) : [];

  const campaigns: DashboardCampaign[] = rows.map((c) => {
    const rev = revisions.find((r) => r.id === c.currentRevisionId);
    const brief = (rev?.brief ?? null) as BriefForm | null;
    const r = rev ? latest.get(rev.id) : undefined;
    const mine = r ? stages.filter((s) => s.runId === r.id) : [];
    const state: CampaignState = !r
      ? "draft"
      : r.status === "needs_input"
        ? "needs_answer"
        : r.status === "error" || r.status === "cancelled"
          ? "stopped"
          : r.status === "done"
            ? "ready"
            : "researching";
    const running = mine.find((s) => s.status === "running");
    return {
      id: c.id,
      name: c.name,
      brand: brief?.brandName ?? "",
      product: brief?.product.name ?? "",
      markets: rev?.markets ?? [],
      campaignType: rev?.campaignType ?? null,
      budgetCents: rev?.budgetCents ?? null,
      currency: rev?.currency ?? "USD",
      version: rev?.number ?? 1,
      createdAt: c.createdAt,
      state,
      progress:
        state === "researching"
          ? { done: mine.filter((s) => s.status === "done").length, total: STAGES.length, current: STAGES.find((s) => s.position === running?.position)?.name ?? null }
          : null,
      directions: r ? (directions.get(r.id) ?? 0) : 0,
      proposals: r ? (proposals.get(r.id) ?? 0) : 0,
      creators: r ? (creators.get(r.id) ?? 0) : 0,
    };
  });

  return { userName: me?.name ?? "", organization: orgs[0]?.name ?? "", campaigns };
}
