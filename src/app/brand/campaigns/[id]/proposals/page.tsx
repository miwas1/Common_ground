import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatFee } from "@/lib/pipeline/money";
import type { Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getProposals } from "@/lib/views/campaign";
import { CAPABILITY_LABEL } from "@/lib/views/labels";

const DIRECTION_TEXT = ["text-direction-1", "text-direction-2", "text-direction-3", "text-direction-4"];
const DIRECTION_BG = ["bg-direction-1/15", "bg-direction-2/15", "bg-direction-3/15", "bg-direction-4/15"];

async function Proposals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run } = await getCampaignHeader(id);
  const items = run ? await getProposals(run.id) : [];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Proposals will show up here once the research has picked creators.</p>;

  const directions = [...new Map(items.map((i) => [i.direction.id, i.direction])).values()].sort((a, b) => a.colorIndex - b.colorIndex);
  return (
    <form action={`/brand/campaigns/${id}/proposals/compare`} className="grid gap-10">
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-2.5 text-sm shadow-sm backdrop-blur">
        <span className="text-muted-foreground">Tick two or three proposals to compare them side by side.</span>
        <Button type="submit" size="sm" variant="outline">Compare selected</Button>
      </div>
      {directions.map((d) => (
        <section key={d.id} id={d.id} className="grid gap-3 scroll-mt-20">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${DIRECTION_TEXT[(d.colorIndex - 1) % 4]}`}>{d.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {items
              .filter((i) => i.direction.id === d.id)
              .map(({ proposal: p, version, creator, portfolio, fit }) => {
                const concept = version.concept as { title: string; logline: string; hook: string };
                const terms = version.terms as { amountCents: number | null; currency: string; package: string };
                const lead = portfolio[0];
                const handle = (creator.handles as { instagram?: string }).instagram;
                return (
                  <div key={p.id} className="relative">
                  <label className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-md bg-card/90 px-2 py-1 text-xs shadow-sm">
                    <input type="checkbox" name="ids" value={p.id} /> Compare
                  </label>
                  <Link href={`/brand/campaigns/${id}/proposals/${p.id}`} className="group">
                    <Card className="h-full transition group-hover:ring-primary/40">
                      <div className={`flex h-28 items-end justify-between gap-2 p-3 ${DIRECTION_BG[(d.colorIndex - 1) % 4]}`}>
                        <p className="text-xs text-muted-foreground">
                          {lead ? <>Past work: “{lead.title}”</> : handle ? <>Real creator · @{handle}</> : "No portfolio on file yet"}
                        </p>
                        {version.number > 1 && <Badge variant="secondary">v{version.number}{version.authorRole === "brand" ? " · edited" : ""}</Badge>}
                      </div>
                      <CardHeader>
                        <CardDescription>
                          {creator.displayName}{creator.city ? ` · ${creator.city}` : ""}
                        </CardDescription>
                        <CardTitle>{concept.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm">
                        <p>{concept.logline}</p>
                        <p className="text-muted-foreground">Opening line: “{concept.hook}”</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="secondary">Relevant past work: {CAPABILITY_LABEL[(fit?.capability as Capability | undefined)?.level ?? "not assessed"]}</Badge>
                          <span>
                            {formatFee(terms)}{terms.amountCents !== null ? ` · ${terms.package}` : ""}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </form>
  );
}

export default function ProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Proposals params={params} />
    </Suspense>
  );
}
