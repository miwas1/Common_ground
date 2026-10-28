import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClaimBadge, ClaimList } from "@/components/claims";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatMoney } from "@/lib/pipeline/money";
import type { BandResult, Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getProposalDetail } from "@/lib/views/campaign";

type Concept = { title: string; logline: string; hook: string; beats: string[]; productIntegration: string; setting: string; openQuestions?: string[] };
type Terms = { package: string; amountCents: number; currency: string; usageTerms: string; validUntil: string | null };

async function Proposal({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run } = await getCampaignHeader(id);
  const detail = run ? await getProposalDetail(run.id, pid) : null;
  if (!detail) notFound();
  const { version, creator, direction, portfolio, fit, claims, fitClaims, directionClaims } = detail;
  const concept = version.concept as Concept;
  const terms = version.terms as Terms;
  const deliverables = version.deliverables as { format: string; count: number; notes: string }[];
  const portfolioClaims = claims.filter((c) => c.kind === "portfolio");
  const commercial = claims.find((c) => c.kind === "commercial");
  const capability = fit?.capability as Capability | undefined;
  const bands = (fit?.culturalBands ?? {}) as Record<string, BandResult>;
  const constraints = fit?.hardConstraints as { passed: boolean; failures: string[] } | undefined;
  const availability = creator.availability as { status?: string; leadTimeDays?: number; note?: string };

  return (
    <div className="grid gap-6">
      <Link href={`/brand/campaigns/${id}/proposals`} className="text-sm text-muted-foreground hover:text-foreground">← All proposals</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{direction.title}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{concept.title}</h2>
            <p className="mt-1 text-muted-foreground">
              {creator.displayName} · {creator.city} · {creator.proposition}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Concept</CardTitle>
              <CardDescription>{concept.logline}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <p><span className="font-medium">Opening hook:</span> “{concept.hook}”</p>
              <ol className="grid gap-2">
                {concept.beats.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">{i + 1}</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ol>
              <p><span className="font-medium">Product integration:</span> {concept.productIntegration}</p>
              <p><span className="font-medium">Setting:</span> {concept.setting}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relevant work</CardTitle>
              <CardDescription>What the creator has already made, cited by the proposal.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {portfolioClaims.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <ClaimBadge kind="portfolio" />
                  <div>
                    <p>{c.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.portfolioItemIds.map((pid) => portfolio.find((p) => p.id === pid)?.title).filter(Boolean).map((t) => `“${t}”`).join(", ")}
                    </p>
                  </div>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-2">
                {portfolio.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.role} · {p.formats.join(", ")}</p>
                    <p className="mt-1 text-xs">{p.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Demo roster: fictional creators for illustration.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deliverables and terms</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <ul className="grid gap-1">
                {deliverables.map((d, i) => (
                  <li key={i}>{d.count} × {d.format}{d.notes ? ` · ${d.notes}` : ""}</li>
                ))}
              </ul>
              <p>
                <span className="font-medium">{formatMoney(terms.amountCents, terms.currency)}</span> for “{terms.package}” · {terms.usageTerms}
                {terms.validUntil ? ` · valid until ${terms.validUntil.slice(0, 10)}` : ""}
              </p>
              {commercial && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ClaimBadge kind="commercial" />
                  <span>{commercial.text}</span>
                </div>
              )}
              <p><span className="font-medium">Experiment:</span> {version.hypothesis}</p>
            </CardContent>
          </Card>
        </div>

        <aside className="grid content-start gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Why this collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimList claims={claims.filter((c) => c.kind === "interpretation" || c.kind === "finding")} />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Fit</CardTitle>
              <CardDescription>Separate dimensions; there is no combined score.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Portfolio capability</p>
                <p>{capability?.level ?? "n/a"}</p>
                {fitClaims.map((c) => (
                  <p key={c.id} className="text-xs text-muted-foreground">{c.text}</p>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Cultural fit (rank within each Qloo query)</p>
                <ul className="text-xs">
                  {Object.entries(bands).map(([k, b]) => (
                    <li key={k}>
                      {k}: {b.band}
                      {b.best ? ` (via ${b.best})` : ""} · {b.measured} of {b.of} references measured
                    </li>
                  ))}
                  {Object.keys(bands).length === 0 && <li>Not measured</li>}
                </ul>
                <p className="mt-1 text-[11px] text-muted-foreground">Based on public references the creator identifies with. It describes their work, not their followers.</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Logistics</p>
                <p className="text-xs">
                  {constraints?.passed ? "Meets market, language, mode and budget requirements" : constraints?.failures.join("; ")} · availability {availability.status ?? "unknown"}
                  {availability.leadTimeDays ? `, ${availability.leadTimeDays}-day lead time` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
          {concept.openQuestions?.length ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Open questions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {concept.openQuestions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Evidence trail</Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Evidence trail</SheetTitle>
                <SheetDescription>Qloo findings are written from stored results; interpretations are the agent&apos;s readings of them. Expand a finding to see the exact request.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-6 px-4 pb-6">
                <div>
                  <h3 className="mb-2 text-sm font-medium">This proposal</h3>
                  <ClaimList claims={claims.filter((c) => c.kind === "interpretation" || c.kind === "finding")} showProvenance />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">Direction: {direction.title}</h3>
                  <ClaimList claims={directionClaims} showProvenance />
                </div>
                <Badge variant="outline" className="justify-self-start">Aggregate affinities · not individuals</Badge>
              </div>
            </SheetContent>
          </Sheet>
        </aside>
      </div>
    </div>
  );
}

export default function ProposalPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Proposal params={params} />
    </Suspense>
  );
}
