import { and, count, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { CampaignTabs } from "@/components/campaign-tabs";
import { RunPanel } from "@/components/run-panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { campaignRevision, proposal } from "@/db/schema";
import { pageAuthorize } from "@/lib/auth/page";
import { formatMoney } from "@/lib/pipeline/money";
import { getCampaignHeader } from "@/lib/views/campaign";
import { CAMPAIGN_TYPE_LABEL } from "@/lib/views/labels";

const MARKET_LABEL: Record<string, string> = { US: "US", GB: "UK", DE: "Germany" };

async function Header({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { campaign, revision, run } = await getCampaignHeader(id);
  const db = await getDb();
  // Proposals set aside by a creator swap no longer count.
  const [{ n }] = run ? await db.select({ n: count() }).from(proposal).where(and(eq(proposal.runId, run.id), ne(proposal.status, "set_aside"))) : [{ n: 0 }];
  const revisions = await db.$count(campaignRevision, eq(campaignRevision.campaignId, id));
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
        {revision && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{revision.markets.map((m) => MARKET_LABEL[m] ?? m).join(" · ")}</span>
            <span aria-hidden>·</span>
            <span>{CAMPAIGN_TYPE_LABEL[revision.campaignType]}</span>
            {revision.budgetCents ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatMoney(revision.budgetCents, revision.currency)} budget</span>
              </>
            ) : null}
            {revision.number > 1 && <Badge variant="outline">Version {revision.number}</Badge>}
            {campaign.isShowcase && <Badge variant="secondary">Example · view only</Badge>}
          </p>
        )}
        {revision?.changeNote && revision.parentRevisionId && (
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Changed from version {revision.number - 1}:</span> {revision.changeNote}.{" "}
            <Link href={`/brand/campaigns/${id}/revisions`} className="font-medium text-primary underline-offset-4 hover:underline">Compare</Link>
          </p>
        )}
      </div>
      {run && <RunPanel runId={run.id} campaignId={id} />}
      <CampaignTabs campaignId={id} counts={{ proposals: n, revisions }} />
    </div>
  );
}

export default function CampaignLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-28 w-full" />}>
        <Header params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </AppShell>
  );
}
