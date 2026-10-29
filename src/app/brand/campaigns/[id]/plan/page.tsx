import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatFee, formatMoney } from "@/lib/pipeline/money";
import { getDb } from "@/db";
import { buildPackages, planItems } from "@/lib/pipeline/stages/budget";
import { getCampaignHeader, getPackages, getProposals } from "@/lib/views/campaign";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PACKAGE_LABEL } from "@/lib/views/labels";

async function Plan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ budget?: string }> }) {
  const { id } = await params;
  const { budget } = await searchParams;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run, revision } = await getCampaignHeader(id);
  if (!run || !revision) return null;
  const currency = revision.currency ?? "USD";
  const whatIfCents = budget ? Math.round(Number(budget.replace(/[^\d.]/g, "")) * 100) : 0;
  const { items, awaitingQuote } = await planItems(await getDb(), run.id);

  // A what-if budget is planned on the spot from the same priced proposals: no research, nothing saved.
  let packages = await getPackages(run.id);
  if (whatIfCents > 0) {
    const proposals = await getProposals(run.id);
    packages = buildPackages(items, whatIfCents, currency, revision.campaignType).map((p, i) => ({
      pkg: { id: `what-if-${i}`, runId: run.id, kind: p.kind, proposalIds: p.items.map((x) => x.proposalId), costCents: p.costCents, rationale: p.rationale },
      proposals: p.items.map((x) => proposals.find((y) => y.proposal.id === x.proposalId)!).filter(Boolean),
    }));
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Different ways to spend your budget, built from each creator&apos;s actual price. Prices in other currencies are converted at approximate rates.
        Open a brief to share it with the creator or your team.
      </p>
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 text-sm" action={`/brand/campaigns/${id}/plan`}>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Try another budget ({currency})</span>
          <Input name="budget" inputMode="decimal" defaultValue={whatIfCents ? String(whatIfCents / 100) : ""} placeholder={revision.budgetCents ? String(revision.budgetCents / 100) : "e.g. 8000"} className="w-40" />
        </label>
        <Button type="submit" variant="outline" size="sm">Show options</Button>
        <span className="text-xs text-muted-foreground">Recalculated instantly from the same proposals. The research isn&apos;t redone.</span>
      </form>
      {whatIfCents > 0 && (
        <p role="status" className="rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm">
          Showing options for <span className="font-medium">{formatMoney(whatIfCents, currency)}</span>
          {revision.budgetCents ? <> instead of your {formatMoney(revision.budgetCents, currency)} budget</> : null}. Nothing is saved.{" "}
          <Link href={`/brand/campaigns/${id}/plan`} className="font-medium underline underline-offset-2">Back to your budget</Link>
        </p>
      )}
      {awaitingQuote > 0 && (
        <p className="text-sm text-muted-foreground">
          {awaitingQuote} {awaitingQuote === 1 ? "proposal is" : "proposals are"} waiting for a quote, so {awaitingQuote === 1 ? "it isn't" : "they aren't"} in these options yet.
        </p>
      )}
      {packages.length === 0 && <p className="text-sm text-muted-foreground">No option fits this budget with the proposals that have prices.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {packages.map(({ pkg, proposals }) => (
          <Card key={pkg.id}>
            <CardHeader>
              <CardDescription>
                <Badge variant="secondary">{PACKAGE_LABEL[pkg.kind] ?? pkg.kind}</Badge>
              </CardDescription>
              <CardTitle className="text-xl">{formatMoney(pkg.costCents, currency)}</CardTitle>
              <CardDescription>{pkg.rationale}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {proposals.map(({ proposal: p, creator, direction, version }) => {
                  const terms = version.terms as { amountCents: number | null; currency: string };
                  return (
                    <li key={p.id} className="flex items-baseline justify-between gap-3">
                      <Link href={`/brand/campaigns/${id}/proposals/${p.id}`} className="hover:underline">
                        {creator.displayName} · <span className="text-muted-foreground">{direction.title}</span>
                      </Link>
                      <span className="flex shrink-0 items-baseline gap-3">
                        <span className="tabular-nums">{formatFee(terms)}</span>
                        <Link href={`/brand/briefs/${id}/${p.id}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                          Brief
                        </Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ budget?: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Plan params={params} searchParams={searchParams} />
    </Suspense>
  );
}
