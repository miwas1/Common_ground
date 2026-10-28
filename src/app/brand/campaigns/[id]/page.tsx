import Link from "next/link";
import { Suspense } from "react";
import { ClaimBadge, ClaimList } from "@/components/claims";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import type { BandResult, Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getStrategy } from "@/lib/views/campaign";

const DIRECTION_BAR = ["bg-direction-1", "bg-direction-2", "bg-direction-3", "bg-direction-4"];
const SOURCE_LABEL: Record<string, string> = { research: "From customer research", team: "Provided by your team", assumption: "Suggested assumption" };
const AGE = (b: string) => b.replaceAll("_", " ").replace("and", "&");

async function Strategy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run } = await getCampaignHeader(id);
  if (!run) return null;
  const { inputs, comparison, directions } = await getStrategy(run.id);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Audience inputs</CardTitle>
            <CardDescription>Where each statement came from stays visible throughout.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {inputs.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant={i.source === "assumption" ? "outline" : "secondary"}>{SOURCE_LABEL[i.source]}</Badge>
                  <span>{i.text}</span>
                </li>
              ))}
              {inputs.length === 0 && <li className="text-muted-foreground">No audience inputs were provided.</li>}
            </ul>
          </CardContent>
        </Card>
        {comparison && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Audience comparison</CardTitle>
              <CardDescription>The audience in your brief, beside the aggregate audience Qloo associates with your references.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                <span className="font-medium">Intended:</span> {comparison.intended.summary}
              </p>
              {comparison.associated.map((a) => (
                <p key={a.label}>
                  <span className="font-medium">Associated with {a.label}:</span>{" "}
                  {a.overIndexed.length ? `over-indexes on ${a.overIndexed.map(AGE).join(", ")}` : "no strong age skew"}
                  {a.genderSkew ? `; skews ${a.genderSkew}` : ""}
                </p>
              ))}
              {comparison.question && <p className="rounded-md bg-muted p-2 text-muted-foreground">{comparison.question}</p>}
            </CardContent>
          </Card>
        )}
      </section>

      {directions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cultural directions appear here when the research reaches them.</p>
      ) : (
        <section className="grid gap-6">
          <h2 className="text-lg font-semibold">Cultural directions</h2>
          {directions.map(({ direction: d, checks, claims, shortlist }) => {
            const art = d.artDirection as { palette?: string; settings?: string[]; moodWords?: string[]; sceneIdeas?: string[] };
            return (
              <Card key={d.id} className="overflow-hidden">
                <div className={`h-1.5 w-full ${DIRECTION_BAR[(d.colorIndex - 1) % 4]}`} aria-hidden />
                <CardHeader>
                  <CardTitle className="text-xl">{d.title}</CardTitle>
                  <CardDescription className="flex items-start gap-2">
                    <ClaimBadge kind="interpretation" />
                    <span>{d.audienceContext}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-[1fr_340px]">
                  <div className="grid content-start gap-5">
                    <div className="grid gap-1 text-sm">
                      <p><span className="font-medium">Product role:</span> {d.productRole}</p>
                      {art.sceneIdeas?.length ? <p><span className="font-medium">Scenes:</span> {art.sceneIdeas.join(" · ")}</p> : null}
                      <p className="text-muted-foreground">
                        Art direction: {art.palette}; {(art.settings ?? []).join(", ")}; {(art.moodWords ?? []).join(", ")}
                      </p>
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-medium">Why this direction</h3>
                      <ClaimList claims={claims} showProvenance />
                    </div>
                    {(d.assumptions as string[]).length > 0 && (
                      <div className="text-sm">
                        <h3 className="mb-1 font-medium">Assumptions</h3>
                        <ul className="list-disc pl-5 text-muted-foreground">
                          {(d.assumptions as string[]).map((a) => <li key={a}>{a}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="grid content-start gap-4">
                    <div className="grid gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                      <h3 className="font-medium">Checks</h3>
                      <Check label="Coherence" text={String(checks.coherence?.summary ?? "Not run")} />
                      <Check
                        label="Input sensitivity"
                        text={String(checks.sensitivity?.summary ?? "Not run")}
                        note={checks.sensitivity?.dependsOnAssumption ? "Depends on an unconfirmed assumption." : undefined}
                      />
                      <Check label="Campaign relevance" text={String(checks.relevance?.summary ?? "Not run")} note={checks.relevance?.fit ? `Judgment: ${String(checks.relevance.fit)}` : undefined} />
                    </div>
                    <div className="grid gap-2">
                      <h3 className="text-sm font-medium">Shortlisted creators</h3>
                      {shortlist.length === 0 && <p className="text-xs text-muted-foreground">Casting runs after the checks.</p>}
                      {shortlist.map(({ fit, creator }) => {
                        const cap = fit.capability as Capability;
                        const bands = fit.culturalBands as Record<string, BandResult>;
                        return (
                          <div key={creator.id} className="rounded-lg border p-2.5 text-sm">
                            <p className="font-medium">
                              {creator.displayName} <span className="font-normal text-muted-foreground">· {creator.city}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{creator.proposition}</p>
                            <p className="mt-1.5 text-xs">
                              <span className="font-medium">Capability:</span> {cap.level}
                            </p>
                            <p className="text-xs">
                              <span className="font-medium">Cultural fit:</span>{" "}
                              {Object.entries(bands)
                                .map(([k, b]) => `${k} ${b.band}`)
                                .join(" · ") || "not measured"}
                            </p>
                          </div>
                        );
                      })}
                      {shortlist.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Shortlist order: portfolio capability, then the number of top-quarter cultural bands, then price. Each band compares creators within one Qloo query; there is no combined match score.
                        </p>
                      )}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/brand/campaigns/${id}/proposals#${d.id}`}>Explore proposals</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Check({ label, text, note }: { label: string; text: string; note?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p>{text}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Strategy params={params} />
    </Suspense>
  );
}
