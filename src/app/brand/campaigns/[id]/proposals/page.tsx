import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatMoney } from "@/lib/pipeline/money";
import type { Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getProposals } from "@/lib/views/campaign";

const DIRECTION_TEXT = ["text-direction-1", "text-direction-2", "text-direction-3", "text-direction-4"];
const DIRECTION_BG = ["bg-direction-1/15", "bg-direction-2/15", "bg-direction-3/15", "bg-direction-4/15"];

async function Proposals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run } = await getCampaignHeader(id);
  const items = run ? await getProposals(run.id) : [];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Proposals appear here when the research finishes casting.</p>;

  const directions = [...new Map(items.map((i) => [i.direction.id, i.direction])).values()].sort((a, b) => a.colorIndex - b.colorIndex);
  return (
    <div className="grid gap-10">
      {directions.map((d) => (
        <section key={d.id} id={d.id} className="grid gap-3 scroll-mt-20">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${DIRECTION_TEXT[(d.colorIndex - 1) % 4]}`}>{d.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {items
              .filter((i) => i.direction.id === d.id)
              .map(({ proposal: p, version, creator, portfolio, fit }) => {
                const concept = version.concept as { title: string; logline: string; hook: string };
                const terms = version.terms as { amountCents: number; currency: string; package: string };
                const lead = portfolio[0];
                return (
                  <Link key={p.id} href={`/brand/campaigns/${id}/proposals/${p.id}`} className="group">
                    <Card className="h-full transition group-hover:ring-primary/40">
                      <div className={`flex h-28 items-end p-3 ${DIRECTION_BG[(d.colorIndex - 1) % 4]}`}>
                        <p className="text-xs text-muted-foreground">Portfolio · “{lead?.title}”</p>
                      </div>
                      <CardHeader>
                        <CardDescription>
                          {creator.displayName} · {creator.city}
                        </CardDescription>
                        <CardTitle>{concept.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm">
                        <p>{concept.logline}</p>
                        <p className="text-muted-foreground">Hook: “{concept.hook}”</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="secondary">Capability: {(fit?.capability as Capability | undefined)?.level ?? "n/a"}</Badge>
                          <span>
                            Quoted {formatMoney(terms.amountCents, terms.currency)} · {terms.package}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Proposals params={params} />
    </Suspense>
  );
}
