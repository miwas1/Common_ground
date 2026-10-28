// Stage 9 — budget packages from real quotes (deterministic). Affinity never becomes spend.

import { eq } from "drizzle-orm";
import { budgetPackage, creator, creatorFit, direction } from "@/db/schema";
import { loadRun, type StageCtx } from "../context";
import { convertCents, formatMoney } from "../money";
import type { Capability } from "./cast";
import { proposalsWithVersions } from "./proposals";

export type PlanItem = {
  proposalId: string;
  directionId: string;
  directionTitle: string;
  creatorName: string;
  costCents: number;
  capability: Capability["level"];
  distribution: boolean;
  production: boolean;
};

export type Package = { kind: "concentrated" | "broad_test" | "production_heavy" | "hybrid"; items: PlanItem[]; costCents: number; rationale: string };

const LEVEL = { strong: 2, partial: 1, none: 0, "not assessed": -1 } as const;
const total = (items: PlanItem[]) => items.reduce((n, i) => n + i.costCents, 0);

/** Greedy fill in the given order, skipping items that would exceed the budget. */
function fill(ordered: PlanItem[], budget: number | null, seed: PlanItem[] = []) {
  const chosen = [...seed];
  for (const item of ordered) {
    if (chosen.some((c) => c.proposalId === item.proposalId)) continue;
    if (budget === null || total(chosen) + item.costCents <= budget) chosen.push(item);
  }
  return chosen;
}

export function buildPackages(items: PlanItem[], budget: number | null, currency: string, campaignType: string): Package[] {
  const packages: Package[] = [];
  const byQuality = (a: PlanItem, b: PlanItem) => LEVEL[b.capability] - LEVEL[a.capability] || a.costCents - b.costCents;
  const directions = [...new Set(items.map((i) => i.directionId))];

  // Concentrated: everything for the direction with the strongest set of proposals that fits.
  const concentrated = directions
    .map((d) => items.filter((i) => i.directionId === d))
    .filter((set) => budget === null || total(set) <= budget)
    .sort((a, b) => b.filter((i) => i.capability === "strong").length - a.filter((i) => i.capability === "strong").length || total(a) - total(b))[0];
  if (concentrated?.length) {
    packages.push({
      kind: "concentrated",
      items: concentrated,
      costCents: total(concentrated),
      rationale: `Commits to “${concentrated[0].directionTitle}” and compares ${concentrated.length} creators' executions of one idea.`,
    });
  }

  // Broad test: the best proposal per direction, as many directions as fit.
  const perDirection = directions.map((d) => items.filter((i) => i.directionId === d).sort(byQuality)[0]).sort((a, b) => a.costCents - b.costCents);
  const broad = fill(perDirection, budget);
  if (broad.length >= 2) {
    packages.push({
      kind: "broad_test",
      items: broad,
      costCents: total(broad),
      rationale: `Tests ${broad.length} directions with one creator each, to learn which cultural world resonates before scaling one.`,
    });
  }

  // Production heavy: the most production-capable proposals that fit.
  if (campaignType !== "creator_distribution") {
    const heavy = fill(items.filter((i) => i.production).sort(byQuality), budget);
    if (heavy.length) {
      packages.push({
        kind: "production_heavy",
        items: heavy,
        costCents: total(heavy),
        rationale: `Fits as many production pieces as the budget allows (${heavy.length}, ${heavy.filter((i) => i.capability === "strong").length} with strong portfolio evidence), strongest first, for paid and owned channels.`,
      });
    }
  }

  // Hybrid: one distribution partner plus production around it.
  const dist = items.filter((i) => i.distribution).sort((a, b) => a.costCents - b.costCents)[0];
  if (dist && campaignType !== "ugc_production" && (budget === null || dist.costCents <= budget)) {
    const hybrid = fill(items.filter((i) => i.production && i.proposalId !== dist.proposalId).sort(byQuality), budget, [dist]);
    packages.push({
      kind: "hybrid",
      items: hybrid,
      costCents: total(hybrid),
      rationale: `Pairs ${dist.creatorName}'s distribution with ${hybrid.length - 1} production piece${hybrid.length === 2 ? "" : "s"}.`,
    });
  }

  // Drop duplicates (same proposal set).
  const seen = new Set<string>();
  return packages
    .filter((p) => {
      const key = p.items.map((i) => i.proposalId).sort().join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => ({ ...p, rationale: `${p.rationale} Total ${formatMoney(p.costCents, currency)}${budget ? ` of ${formatMoney(budget, currency)}` : ""}.` }));
}

export async function planBudget(ctx: StageCtx) {
  const { revision } = await loadRun(ctx.db, ctx.runId);
  const proposals = await proposalsWithVersions(ctx.db, ctx.runId);
  const dirs = new Map((await ctx.db.select().from(direction).where(eq(direction.runId, ctx.runId))).map((d) => [d.id, d.title]));
  const fits = await ctx.db.select().from(creatorFit).where(eq(creatorFit.runId, ctx.runId));
  const creators = new Map((await ctx.db.select().from(creator)).map((c) => [c.id, c]));

  const items: PlanItem[] = proposals
    .filter((p) => p.version)
    .map(({ proposal: pr, version }) => {
      const terms = version!.terms as { amountCents: number; currency: string; package: string };
      const c = creators.get(pr.creatorId)!;
      const fit = fits.find((f) => f.creatorId === pr.creatorId && f.directionId === pr.directionId);
      return {
        proposalId: pr.id,
        directionId: pr.directionId,
        directionTitle: dirs.get(pr.directionId) ?? "",
        creatorName: c.displayName,
        costCents: convertCents(terms.amountCents, terms.currency, revision.currency),
        capability: ((fit?.capability as Capability | undefined)?.level ?? "none") as Capability["level"],
        distribution: c.modes.includes("creator_distribution") && /post|posted|takeover|segment|whitelist/i.test(terms.package),
        production: c.modes.includes("ugc_production"),
      };
    });

  await ctx.db.delete(budgetPackage).where(eq(budgetPackage.runId, ctx.runId));
  const packages = buildPackages(items, revision.budgetCents, revision.currency, revision.campaignType);
  if (packages.length) {
    await ctx.db.insert(budgetPackage).values(
      packages.map((p) => ({ runId: ctx.runId, kind: p.kind, proposalIds: p.items.map((i) => i.proposalId), costCents: p.costCents, rationale: p.rationale })),
    );
  }
  return { packages: packages.map((p) => ({ kind: p.kind, proposals: p.items.length, costCents: p.costCents })) };
}
