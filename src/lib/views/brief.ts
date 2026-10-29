import "server-only";

// The exportable proposal brief (src/lib/briefs/markdown.ts), assembled from the proposal's current
// version and its claims. Called after requireAuthorized(campaign.read).

import type { BriefDoc } from "@/lib/briefs/markdown";
import { getCampaignHeader, getProposalDetail } from "./campaign";

const MARKET_LABEL: Record<string, string> = { US: "US", GB: "UK", DE: "Germany" };

export async function getProposalBrief(campaignId: string, proposalId: string): Promise<BriefDoc | null> {
  const { campaign, revision, brief, run } = await getCampaignHeader(campaignId);
  if (!run || !revision || !brief) return null;
  const detail = await getProposalDetail(run.id, proposalId);
  if (!detail) return null;
  const { version, creator, direction, portfolio, claims } = detail;
  const concept = version.concept as BriefDoc["concept"] & { openQuestions?: string[] };
  const art = direction.artDirection as { palette?: string; moodWords?: string[]; settings?: string[] };
  const byId = new Map(claims.map((c) => [c.id, c]));

  return {
    campaign: campaign.name,
    brand: brief.brandName,
    product: brief.product,
    objective: brief.objective,
    markets: revision.markets.map((m) => MARKET_LABEL[m] ?? m),
    revision: revision.number,
    direction: {
      title: direction.title,
      audienceContext: direction.audienceContext,
      productRole: direction.productRole,
      palette: art.palette,
      moodWords: art.moodWords ?? [],
      settings: art.settings ?? [],
    },
    creator: { name: creator.displayName, city: creator.city, proposition: creator.proposition, isDemo: creator.isDemo },
    concept: {
      title: concept.title,
      logline: concept.logline,
      hook: concept.hook,
      beats: concept.beats,
      productIntegration: concept.productIntegration,
      setting: concept.setting,
    },
    deliverables: version.deliverables as BriefDoc["deliverables"],
    terms: version.terms as BriefDoc["terms"],
    hypothesis: version.hypothesis,
    openQuestions: concept.openQuestions ?? [],
    why: claims
      .filter((c) => c.kind === "interpretation")
      .map((c) => ({ text: c.text, findings: c.basedOn.map((id) => byId.get(id)?.text).filter((t): t is string => Boolean(t)) })),
    relevantWork: claims
      .filter((c) => c.kind === "portfolio")
      .map((c) => ({ text: c.text, titles: c.portfolioItemIds.map((pid) => portfolio.find((p) => p.id === pid)?.title).filter((t): t is string => Boolean(t)) })),
    version: version.number,
    generatedAt: new Date().toISOString(),
  };
}
