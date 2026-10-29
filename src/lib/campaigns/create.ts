import "server-only";

// Creating a campaign from the brief form: one revision, its audience inputs, and a research run.
// Shared by the form's server action and the development-only API route.

import { getDb } from "@/db";
import { briefInput, campaign, campaignRevision } from "@/db/schema";
import { actingBrandOrg } from "@/lib/auth/brand";
import { approvedFacts } from "@/lib/brand/profile";
import type { Actor } from "@/lib/auth/authorize";
import type { BriefForm } from "@/lib/pipeline/context";
import { startResearch } from "@/lib/pipeline/start";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** A problem with the brief the user can fix; its message is shown beside the form. */
export class BriefError extends Error {}

const MARKETS = ["US", "GB", "DE"];
const LANGUAGE_FOR: Record<string, string> = { US: "en", GB: "en", DE: "de" };

export async function createCampaignFromForm(actor: Actor & { activeOrganizationId: string | null }, form: FormData) {
  const organizationId = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  if (!organizationId) throw new BriefError("Your account needs a brand workspace first.");
  const markets = MARKETS.filter((m) => form.get(`market_${m}`) === "on");
  if (markets.length === 0) throw new BriefError("Choose at least one market.");
  const brief: BriefForm = {
    brandName: str(form, "brandName"),
    product: { name: str(form, "productName"), description: str(form, "productDescription") },
    objective: str(form, "objective"),
    notes: str(form, "notes"),
    deliverables: str(form, "deliverables"),
    constraints: str(form, "constraints"),
  };
  if (!brief.brandName || !brief.product.name) throw new BriefError("Add the brand and the product.");
  const budget = Number(str(form, "budget").replace(/[^\d.]/g, ""));
  const audience = [0, 1, 2, 3, 4]
    .map((i) => ({ text: str(form, `audience_${i}`), source: str(form, `audience_source_${i}`) }))
    .filter((a) => a.text && ["research", "team", "assumption"].includes(a.source)) as { text: string; source: "research" | "team" | "assumption" }[];

  const db = await getDb();
  // Statements ticked from the brand profile: only this brand's approved ones count.
  const picked = form.getAll("profile_fact").map(String);
  const facts = picked.length ? (await approvedFacts(db, organizationId)).filter((f) => picked.includes(f.id)) : [];
  const rules = facts.filter((f) => f.kind === "avoid" || f.kind === "approved_claim");
  if (rules.length) {
    brief.constraints = [brief.constraints, ...rules.map((f) => (f.kind === "avoid" ? f.text : `Approved claim: ${f.text}`))].filter(Boolean).join("; ");
  }
  const fromProfile = facts
    .filter((f) => f.kind === "research" || f.kind === "measured" || f.kind === "belief")
    .map((f) => ({ text: f.text, source: (f.kind === "belief" ? "team" : "research") as "research" | "team", brandFactId: f.id }));

  const [c] = await db.insert(campaign).values({ name: str(form, "name") || `${brief.product.name} campaign`, organizationId }).returning({ id: campaign.id });
  const [rev] = await db
    .insert(campaignRevision)
    .values({
      campaignId: c.id,
      number: 1,
      brief,
      campaignType: (["ugc_production", "creator_distribution", "hybrid"].includes(str(form, "campaignType")) ? str(form, "campaignType") : "ugc_production") as "ugc_production",
      markets,
      languages: [...new Set(markets.map((m) => LANGUAGE_FOR[m]))],
      budgetCents: Number.isFinite(budget) && budget > 0 ? Math.round(budget * 100) : null,
      currency: ["USD", "GBP", "EUR"].includes(str(form, "currency")) ? str(form, "currency") : "USD",
      createdBy: actor.userId,
    })
    .returning({ id: campaignRevision.id });
  const inputs: { text: string; source: "research" | "team" | "assumption"; brandFactId?: string }[] = [...audience, ...fromProfile];
  if (inputs.length) await db.insert(briefInput).values(inputs.map((a) => ({ revisionId: rev.id, text: a.text, source: a.source, brandFactId: a.brandFactId ?? null })));
  await startResearch(rev.id, c.id);
  return c.id;
}

