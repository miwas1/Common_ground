import "server-only";

// Creating a campaign from the brief form: one revision, its audience inputs, and a research run.
// Shared by the form's server action and the development-only API route.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { member } from "@/db/auth-schema";
import { briefInput, campaign, campaignRevision, orgProfile } from "@/db/schema";
import type { Actor } from "@/lib/auth/authorize";
import type { BriefForm } from "@/lib/pipeline/context";
import { startResearch } from "@/lib/pipeline/start";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** The brand organization the actor is working in: their active org if it is a brand they belong to. */
async function actingBrandOrg(userId: string, activeOrganizationId: string | null) {
  const db = await getDb();
  const orgs = await db
    .select({ id: member.organizationId, kind: orgProfile.kind })
    .from(member)
    .innerJoin(orgProfile, eq(orgProfile.organizationId, member.organizationId))
    .where(and(eq(member.userId, userId), eq(orgProfile.kind, "brand")));
  return orgs.find((o) => o.id === activeOrganizationId)?.id ?? orgs[0]?.id ?? null;
}

const MARKETS = ["US", "GB", "DE"];
const LANGUAGE_FOR: Record<string, string> = { US: "en", GB: "en", DE: "de" };

export async function createCampaignFromForm(actor: Actor & { activeOrganizationId: string | null }, form: FormData) {
  const organizationId = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  if (!organizationId) throw new Error("Join or create a brand organization first");
  const markets = MARKETS.filter((m) => form.get(`market_${m}`) === "on");
  if (markets.length === 0) throw new Error("Choose at least one market");
  const brief: BriefForm = {
    brandName: str(form, "brandName"),
    product: { name: str(form, "productName"), description: str(form, "productDescription") },
    objective: str(form, "objective"),
    notes: str(form, "notes"),
    deliverables: str(form, "deliverables"),
    constraints: str(form, "constraints"),
  };
  if (!brief.brandName || !brief.product.name) throw new Error("Brand and product are required");
  const budget = Number(str(form, "budget").replace(/[^\d.]/g, ""));
  const audience = [0, 1, 2, 3, 4]
    .map((i) => ({ text: str(form, `audience_${i}`), source: str(form, `audience_source_${i}`) }))
    .filter((a) => a.text && ["research", "team", "assumption"].includes(a.source)) as { text: string; source: "research" | "team" | "assumption" }[];

  const db = await getDb();
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
  if (audience.length) await db.insert(briefInput).values(audience.map((a) => ({ revisionId: rev.id, text: a.text, source: a.source })));
  await startResearch(rev.id, c.id);
  return c.id;
}

