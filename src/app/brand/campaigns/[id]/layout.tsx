import { count, eq } from "drizzle-orm";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { CampaignTabs } from "@/components/campaign-tabs";
import { RunPanel } from "@/components/run-panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { proposal } from "@/db/schema";
import { pageAuthorize } from "@/lib/auth/page";
import { formatMoney } from "@/lib/pipeline/money";
import { getCampaignHeader } from "@/lib/views/campaign";

const TYPE_LABEL: Record<string, string> = { ugc_production: "Paid UGC", creator_distribution: "Creator distribution", hybrid: "Hybrid" };
const MARKET_LABEL: Record<string, string> = { US: "US", GB: "UK", DE: "Germany" };

async function Header({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { campaign, revision, run } = await getCampaignHeader(id);
  const db = await getDb();
  const [{ n }] = run ? await db.select({ n: count() }).from(proposal).where(eq(proposal.runId, run.id)) : [{ n: 0 }];
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
        {revision && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{revision.markets.map((m) => MARKET_LABEL[m] ?? m).join(" · ")}</span>
            <span aria-hidden>·</span>
            <span>{TYPE_LABEL[revision.campaignType]}</span>
            {revision.budgetCents ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatMoney(revision.budgetCents, revision.currency)} production budget</span>
              </>
            ) : null}
            <Badge variant="outline">Revision {revision.number}</Badge>
            {campaign.isShowcase && <Badge variant="secondary">Showcase · read-only</Badge>}
          </p>
        )}
      </div>
      {run && <RunPanel runId={run.id} campaignId={id} />}
      <CampaignTabs campaignId={id} counts={{ proposals: n }} />
    </div>
  );
}

export default function CampaignLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <AppShell area="brand">
      <Suspense fallback={<Skeleton className="h-28 w-full" />}>
        <Header params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </AppShell>
  );
}
