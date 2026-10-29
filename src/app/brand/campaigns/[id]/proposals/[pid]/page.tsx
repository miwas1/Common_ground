import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClaimBadge, ClaimList } from "@/components/claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { editProposalAction, simplerAction, swapCreatorAction } from "@/app/brand/proposal-actions";
import { ActionForm } from "@/components/action-form";
import { PendingButton } from "@/components/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { pageAuthorize } from "@/lib/auth/page";
import { swapCandidates, versionHistory } from "@/lib/proposals/control";
import { audienceLean, describeLean, occupationLabel, type QlooPersonProfile } from "@/lib/roster/qloo";
import { formatFee } from "@/lib/pipeline/money";
import type { BandResult, Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getProposalDetail } from "@/lib/views/campaign";
import { BAND_LABEL, CAPABILITY_LABEL } from "@/lib/views/labels";

type Concept = { title: string; logline: string; hook: string; beats: string[]; productIntegration: string; setting: string; openQuestions?: string[] };
type Terms = { package: string; amountCents: number | null; currency: string; usageTerms: string; validUntil: string | null };

const CHANGED: Record<string, string> = {
  edit: "Your edit is saved as a new version. Earlier versions are kept below.",
  simpler: "A simpler version of the same idea is saved as a new version. Earlier versions are kept below.",
  swap: "Creator swapped. The old proposal is set aside, and the budget options were recalculated. No research was redone.",
};

async function Proposal({ params, searchParams }: { params: Promise<{ id: string; pid: string }>; searchParams: Promise<{ changed?: string }> }) {
  const { id, pid } = await params;
  const { changed } = await searchParams;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run, campaign } = await getCampaignHeader(id);
  const detail = run ? await getProposalDetail(run.id, pid) : null;
  if (!detail) notFound();
  const { version, creator, direction, portfolio, fit, claims, fitClaims, directionClaims } = detail;
  const setAside = detail.proposal.status === "set_aside";
  const canChange = !campaign.isShowcase && !setAside;
  const db = await getDb();
  const [history, candidates] = await Promise.all([versionHistory(db, pid), canChange ? swapCandidates(db, pid) : Promise.resolve([])]);
  const known = creator.qlooPersonId ? (creator.qlooProfile as QlooPersonProfile) : null;
  const handle = (creator.handles as { instagram?: string }).instagram;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/brand/campaigns/${id}/proposals`} className="text-sm text-muted-foreground hover:text-foreground">← All proposals</Link>
        <div className="flex flex-wrap gap-2">
          {canChange && (
            <>
              <EditSheet campaignId={id} proposalId={pid} concept={version.concept as Concept} deliverables={version.deliverables as { format: string; count: number; notes: string }[]} hypothesis={version.hypothesis} />
              <form action={simplerAction.bind(null, id, pid)}>
                <PendingButton variant="outline" size="sm" pendingLabel="Simplifying…">Simpler version</PendingButton>
              </form>
              <SwapSheet campaignId={id} proposalId={pid} current={creator.displayName} candidates={candidates} />
            </>
          )}
          <Button asChild variant="outline" size="sm">
            <a href={`/brand/briefs/${id}/${pid}/brief.md`} download>Download brief</a>
          </Button>
          <Button asChild size="sm">
            <Link href={`/brand/briefs/${id}/${pid}`}>Open brief to share</Link>
          </Button>
        </div>
      </div>
      {changed && CHANGED[changed] && (
        <p role="status" className="rounded-xl border border-success/25 bg-success-soft/60 px-4 py-3 text-sm">{CHANGED[changed]}</p>
      )}
      {setAside && (
        <p className="rounded-xl border border-warning/25 bg-warning-soft/60 px-4 py-3 text-sm">
          This proposal was replaced by a creator swap and is kept for the record. It is no longer part of the budget options.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{direction.title}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{concept.title}</h2>
            <p className="mt-1 text-muted-foreground">
              {[creator.displayName, creator.city, creator.proposition ?? (known ? known.occupations.slice(0, 3).map(occupationLabel).join(", ") : null)].filter(Boolean).join(" · ")}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Concept</CardTitle>
              <CardDescription>{concept.logline}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <p><span className="font-medium">Opening line:</span> “{concept.hook}”</p>
              <ol className="grid gap-2">
                {concept.beats.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">{i + 1}</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ol>
              <p><span className="font-medium">How the product appears:</span> {concept.productIntegration}</p>
              <p><span className="font-medium">Setting:</span> {concept.setting}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relevant work</CardTitle>
              <CardDescription>Things this creator has already made that show they can do this.</CardDescription>
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
              {portfolio.length === 0 && (
                <div className="rounded-lg border border-dashed p-3">
                  {known ? (
                    <>
                      <p><span className="text-[10px] font-semibold tracking-[0.14em] text-info uppercase">Qloo</span> {known.occupations.slice(0, 4).map(occupationLabel).join(" · ") || "Public figure"}</p>
                      <p className="mt-1 text-muted-foreground">Audience: {describeLean(audienceLean(known.audience))}{handle ? ` · @${handle}` : ""}</p>
                    </>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">No portfolio pieces on file yet, so this proposal claims nothing about their past work. Add links on the Creators page.</p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {portfolio.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.role} · {p.formats.join(", ")}</p>
                    <p className="mt-1 text-xs">{p.description}</p>
                  </div>
                ))}
              </div>
              {creator.isDemo && <p className="text-[11px] text-muted-foreground">This is a made-up demo creator.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What you get and what it costs</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <ul className="grid gap-1">
                {deliverables.map((d, i) => (
                  <li key={i}>{d.count} × {d.format}{d.notes ? ` · ${d.notes}` : ""}</li>
                ))}
              </ul>
              <p>
                {terms.amountCents === null ? <><span className="font-medium">Quote required</span> · ask the creator for a price and usage terms</> : <><span className="font-medium">{formatFee(terms)}</span> for “{terms.package}” · {terms.usageTerms}</>}
                {terms.validUntil ? ` · valid until ${terms.validUntil.slice(0, 10)}` : ""}
              </p>
              {commercial && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ClaimBadge kind="commercial" />
                  <span>{commercial.text}</span>
                </div>
              )}
              <p><span className="font-medium">What this tests:</span> {version.hypothesis}</p>
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
              <CardTitle>How well they fit</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Relevant past work</p>
                <p>{CAPABILITY_LABEL[capability?.level ?? "not assessed"]}</p>
                {fitClaims.map((c) => (
                  <p key={c.id} className="text-xs text-muted-foreground">{c.text}</p>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Culture fit, compared with the other creators</p>
                <ul className="text-xs">
                  {Object.entries(bands).map(([k, b]) => (
                    <li key={k}>
                      {k === "audience" ? "Qloo audience" : k}: {BAND_LABEL[b.band] ?? b.band}
                      {b.best ? ` (best match: ${b.best})` : ""}
                    </li>
                  ))}
                  {Object.keys(bands).length === 0 && <li>No data</li>}
                </ul>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {bands.audience ? "Qloo audience ranks the people who like this creator against the direction. The rest is" : "Based on"} the names the creator says inspire their work, not their followers.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Practical details</p>
                <p className="text-xs">
                  {constraints?.passed ? "Works in your markets, language and budget" : constraints?.failures.join("; ")} · availability: {availability.status ?? "unknown"}
                  {availability.leadTimeDays ? `, needs ${availability.leadTimeDays} days' notice` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
          {concept.openQuestions?.length ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Still to agree</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {concept.openQuestions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Card size="sm">
            <CardHeader>
              <CardTitle>Versions</CardTitle>
              <CardDescription>Every change is a new version. Nothing is overwritten.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="grid grid-cols-[2.25rem_1fr] gap-2">
                    <span className={`flex h-6 items-center justify-center rounded-md text-xs font-medium tabular-nums ${h.id === version.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>v{h.number}</span>
                    <div>
                      <p>{h.changeNote ?? (h.authorRole === "agent" ? "Drafted by the agent" : "Edited")}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.authorRole === "brand" ? (h.author ?? "Your team") : "Agent"} · {h.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                        {h.id === version.id ? " · current" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">See the evidence</Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>The evidence</SheetTitle>
                <SheetDescription>Each insight is shown with the Qloo data it is based on.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-6 px-4 pb-6">
                <div>
                  <h3 className="mb-2 text-sm font-medium">This proposal</h3>
                  <ClaimList claims={claims.filter((c) => c.kind === "interpretation" || c.kind === "finding")} />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">Direction: {direction.title}</h3>
                  <ClaimList claims={directionClaims} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </aside>
      </div>
    </div>
  );
}

function EditSheet({ campaignId, proposalId, concept, deliverables, hypothesis }: { campaignId: string; proposalId: string; concept: Concept; deliverables: { format: string; count: number; notes: string }[]; hypothesis: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Edit</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit this proposal</SheetTitle>
          <SheetDescription>Your changes are saved as a new version, credited to you. The evidence behind the proposal stays attached.</SheetDescription>
        </SheetHeader>
        <ActionForm action={editProposalAction.bind(null, campaignId, proposalId)} className="grid gap-4 px-4 pb-6">
          <EditField label="Title" name="title" defaultValue={concept.title} />
          <EditField label="Summary" name="logline" defaultValue={concept.logline} rows={2} />
          <EditField label="Opening line" name="hook" defaultValue={concept.hook} rows={2} />
          <EditField label="Story beats, one per line" name="beats" defaultValue={concept.beats.join("\n")} rows={6} />
          <EditField label="How the product appears" name="productIntegration" defaultValue={concept.productIntegration} rows={2} />
          <EditField label="Setting" name="setting" defaultValue={concept.setting} />
          <EditField label="What gets made, one per line (e.g. 2 × Vertical video — with hooks)" name="deliverables" defaultValue={deliverables.map((d) => `${d.count} × ${d.format}${d.notes ? ` — ${d.notes}` : ""}`).join("\n")} rows={3} />
          <EditField label="What this tests" name="hypothesis" defaultValue={hypothesis} rows={2} />
          <EditField label="Still to agree, one per line" name="openQuestions" defaultValue={(concept.openQuestions ?? []).join("\n")} rows={3} />
          <PendingButton pendingLabel="Saving…" className="justify-self-start">Save as a new version</PendingButton>
        </ActionForm>
      </SheetContent>
    </Sheet>
  );
}

function EditField({ label, name, defaultValue, rows }: { label: string; name: string; defaultValue: string; rows?: number }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {rows ? <Textarea id={name} name={name} defaultValue={defaultValue} rows={rows} /> : <Input id={name} name={name} defaultValue={defaultValue} />}
    </div>
  );
}

function SwapSheet({ campaignId, proposalId, current, candidates }: { campaignId: string; proposalId: string; current: string; candidates: Awaited<ReturnType<typeof swapCandidates>> }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Swap creator</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Swap {current} for someone else</SheetTitle>
          <SheetDescription>
            We write a proposal for the new creator in the same direction, set this one aside and recalculate the budget options. The research isn&apos;t redone.
          </SheetDescription>
        </SheetHeader>
        {candidates.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">No other creator passed the checks for this direction.</p>
        ) : (
          <ActionForm action={swapCreatorAction.bind(null, campaignId, proposalId)} className="grid gap-4 px-4 pb-6">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Who should take it?</legend>
              {candidates.slice(0, 8).map((c, i) => (
                <label key={c.creator.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name="creatorId" value={c.creator.id} defaultChecked={i === 0} className="mt-1" />
                  <span>
                    <span className="font-medium">{c.creator.displayName}</span>
                    <span className="text-muted-foreground">{c.creator.city ? ` · ${c.creator.city}` : ""}</span>
                    <span className="block text-xs text-muted-foreground">
                      Relevant past work: {CAPABILITY_LABEL[c.capability.level] ?? c.capability.level}
                      {c.cheapestCents === null ? " · Quote required" : ` · from ${formatFee({ amountCents: c.cheapestCents, currency: "USD" })}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="grid gap-1.5">
              <Label htmlFor="reason">Why the swap? (optional, kept with the new version)</Label>
              <Input id="reason" name="reason" placeholder="e.g. Not available in June" />
            </div>
            <PendingButton pendingLabel="Writing the new proposal…" className="justify-self-start">Swap creator</PendingButton>
          </ActionForm>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function ProposalPage({ params, searchParams }: { params: Promise<{ id: string; pid: string }>; searchParams: Promise<{ changed?: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Proposal params={params} searchParams={searchParams} />
    </Suspense>
  );
}
