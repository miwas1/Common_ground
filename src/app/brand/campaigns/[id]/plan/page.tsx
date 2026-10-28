import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatMoney, INDICATIVE_FX_DATE } from "@/lib/pipeline/money";
import { getCampaignHeader, getPackages } from "@/lib/views/campaign";

const KIND: Record<string, string> = {
  concentrated: "Concentrated",
  broad_test: "Broad test",
  production_heavy: "Production-heavy",
  hybrid: "Hybrid",
};

async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run, revision } = await getCampaignHeader(id);
  const packages = run ? await getPackages(run.id) : [];
  if (packages.length === 0) return <p className="text-sm text-muted-foreground">Budget packages appear when proposals have quotes.</p>;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Packages are assembled from real quotes; cultural affinity is never converted into spend. Quotes in other currencies use indicative rates from {INDICATIVE_FX_DATE}.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {packages.map(({ pkg, proposals }) => (
          <Card key={pkg.id}>
            <CardHeader>
              <CardDescription>
                <Badge variant="secondary">{KIND[pkg.kind] ?? pkg.kind}</Badge>
              </CardDescription>
              <CardTitle className="text-xl">{formatMoney(pkg.costCents, revision?.currency ?? "USD")}</CardTitle>
              <CardDescription>{pkg.rationale}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {proposals.map(({ proposal: p, creator, direction, version }) => {
                  const terms = version.terms as { amountCents: number; currency: string };
                  return (
                    <li key={p.id} className="flex items-baseline justify-between gap-3">
                      <Link href={`/brand/campaigns/${id}/proposals/${p.id}`} className="hover:underline">
                        {creator.displayName} · <span className="text-muted-foreground">{direction.title}</span>
                      </Link>
                      <span className="shrink-0 tabular-nums">{formatMoney(terms.amountCents, terms.currency)}</span>
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

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Plan params={params} />
    </Suspense>
  );
}
