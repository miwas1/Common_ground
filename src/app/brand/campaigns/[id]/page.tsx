import { ArrowRight, AtSign, Check, Minus, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimList } from "@/components/claims";
import { RefinePanel } from "@/components/refine-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { addDiscoveredAction } from "@/app/brand/creators/actions";
import { getDb } from "@/db";
import { actingBrandOrg } from "@/lib/auth/brand";
import { getActor } from "@/lib/auth/actor";
import { pageAuthorize } from "@/lib/auth/page";
import type { BandResult, Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getStrategy } from "@/lib/views/campaign";
import { BAND_LABEL, CAPABILITY_LABEL, checkLines, SOURCE_LABEL } from "@/lib/views/labels";
import { paletteSwatches } from "@/lib/views/palette";
import { audienceLean, describeLean, leanMatchesIntended, occupationLabel, type CreatorAudience } from "@/lib/roster/qloo";
import { rosterPersonIds } from "@/lib/roster/roster";
import { CREATOR_OCCUPATIONS } from "@/lib/pipeline/stages/discover";

const AGE = (b: string) => b.replaceAll("_", " ").replace("and", "&");

async function Strategy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run, campaign, revision } = await getCampaignHeader(id);
  if (!run || !revision) return null;
  const refinable = !campaign.isShowcase && ["done", "error", "cancelled"].includes(run.status);
  const { inputs, comparison, directions, intendedAges } = await getStrategy(run.id);
  // "On your roster" is about the viewer's own roster, which for the showcase isn't the campaign's owner.
  const actor = await getActor();
  const viewerOrg = actor ? await actingBrandOrg(actor.userId, actor.activeOrganizationId) : null;
  const onRoster = viewerOrg ? await rosterPersonIds(await getDb(), viewerOrg) : new Set<string>();

  return (
    <div className="grid gap-8">
      <section className="grid gap-3 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>What you told us about your audience</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {inputs.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant={i.source === "assumption" ? "outline" : "secondary"}>{SOURCE_LABEL[i.source]}</Badge>
                  <span>{i.text}</span>
                </li>
              ))}
              {inputs.length === 0 && <li className="text-muted-foreground">You didn&apos;t describe the audience.</li>}
            </ul>
          </CardContent>
        </Card>
        {comparison && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Who your references attract</CardTitle>
              <CardDescription>The audience in your brief, next to the audience Qloo links to the names you gave.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                <span className="font-medium">Your brief:</span> {comparison.intended.summary}
              </p>
              {comparison.associated.map((a) => (
                <p key={a.label}>
                  <span className="font-medium">{a.label}:</span>{" "}
                  {a.overIndexed.length ? `leans towards ages ${a.overIndexed.map(AGE).join(", ")}` : "no clear age lean"}
                  {a.genderSkew ? `; leans ${a.genderSkew}` : ""}
                </p>
              ))}
              {comparison.differs && (
                <p className="rounded-md bg-muted p-2 text-muted-foreground">These names attract a different audience from the one in your brief. Is this campaign aiming at a new group?</p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {refinable && <RefinePanel campaignId={id} revisionId={revision.id} budgetCents={revision.budgetCents} currency={revision.currency} />}

      {directions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creative directions will show up here once the research gets to them.</p>
      ) : (
        <section className="grid gap-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Creative directions</p>
              <h2 className="mt-1 font-display text-3xl tracking-tight">{directions.length} ways into this audience</h2>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">Each one comes with the reasoning, the Qloo results behind it, and the creators who suit it.</p>
          </div>
          {directions.map((entry, i) => (
            <DirectionCard key={entry.direction.id} entry={entry} index={i} total={directions.length} campaignId={id} intendedAges={intendedAges} onRoster={onRoster} canAdd={Boolean(viewerOrg)} />
          ))}
        </section>
      )}
    </div>
  );
}

type DirectionEntry = Awaited<ReturnType<typeof getStrategy>>["directions"][number];

function DirectionCard({
  entry,
  index,
  total,
  campaignId,
  intendedAges,
  onRoster,
  canAdd,
}: {
  entry: DirectionEntry;
  index: number;
  total: number;
  campaignId: string;
  intendedAges: string[];
  onRoster: Set<string>;
  canAdd: boolean;
}) {
  const { direction: d, checks, claims, shortlist, discovered, profileFit } = entry;
  const art = d.artDirection as { palette?: string; settings?: string[]; moodWords?: string[]; sceneIdeas?: string[] };
  const colour = `var(--direction-${((d.colorIndex - 1) % 4) + 1})`;
  const swatches = paletteSwatches(art.palette);
  const assumptions = d.assumptions as string[];
  const lines = checkLines(checks);

  return (
    <article id={d.id} className="scroll-mt-20 overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-20px_rgb(0_0_0/0.18)]">
      <div className="h-1 w-full" style={{ background: colour }} aria-hidden />
      <header className="grid gap-6 border-b px-6 py-7 sm:px-8 lg:grid-cols-[1fr_300px] lg:gap-10">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <span className="size-2 rounded-full" style={{ background: colour }} aria-hidden />
            Direction {String(index + 1).padStart(2, "0")} of {String(total).padStart(2, "0")}
          </p>
          <h3 className="mt-3 font-display text-4xl leading-[1.08] sm:text-[2.75rem]">{d.title}</h3>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-foreground/80">{d.audienceContext}</p>
        </div>
        <dl className="grid content-start gap-3 rounded-xl bg-muted/50 p-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Checks</p>
          {lines.map((c) => (
            <CheckRow key={c.question} question={c.question} answer={c.answer} note={c.note} />
          ))}
          {profileFit && <ProfileFitRow fit={profileFit} />}
        </dl>
      </header>

      <div className="grid lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-9 px-6 py-7 sm:px-8">
          <div className="grid gap-8 md:grid-cols-2">
            <Block title="Where the product fits">
              <p className="text-[15px] leading-relaxed">{d.productRole}</p>
            </Block>
            {art.sceneIdeas?.length ? (
              <Block title="Scenes to shoot">
                <ol className="grid gap-2.5">
                  {art.sceneIdeas.map((scene, n) => (
                    <li key={scene} className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm leading-relaxed">
                      <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground tabular-nums">{n + 1}</span>
                      {scene}
                    </li>
                  ))}
                </ol>
              </Block>
            ) : null}
          </div>

          <Block title="Look and feel">
            <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[1.2fr_1fr]">
              {swatches.length > 0 && (
                <ul className="grid gap-2">
                  {swatches.map((sw) => (
                    <li key={sw.name} className="flex items-center gap-2.5 text-sm">
                      <span
                        className="size-7 shrink-0 rounded-md border shadow-inner"
                        style={{ background: sw.hex ?? "repeating-linear-gradient(45deg, var(--muted), var(--muted) 3px, transparent 3px, transparent 6px)" }}
                        aria-hidden
                      />
                      {sw.name}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid content-start gap-3">
                {art.settings?.length ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Settings</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {art.settings.map((x) => (
                        <li key={x} className="rounded-md bg-muted px-2 py-1 text-xs">{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {art.moodWords?.length ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Mood</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {art.moodWords.map((x) => (
                        <li key={x} className="rounded-full border px-2.5 py-0.5 text-xs capitalize">{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </Block>

          <Block title="Why this direction" aside="Insights are ours. The Qloo rows under each one are the results it rests on.">
            <ClaimList claims={claims} />
          </Block>

          {assumptions.length > 0 && (
            <div className="rounded-xl border border-warning/25 bg-warning-soft/60 p-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-warning uppercase">To confirm before you commit</p>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {assumptions.map((a) => (
                  <li key={a} className="grid grid-cols-[0.75rem_1fr] gap-2">
                    <span className="mt-2 size-1.5 rounded-full bg-warning" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="grid content-start gap-4 border-t bg-muted/25 px-6 py-7 sm:px-8 lg:border-t-0 lg:border-l lg:px-6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Creators who fit</p>
            {shortlist.length > 0 && <span className="text-xs text-muted-foreground">{shortlist.length} matched</span>}
          </div>
          {shortlist.length === 0 && <p className="text-sm text-muted-foreground">Creators are picked after the checks.</p>}
          <ul className="grid gap-2.5">
            {shortlist.map(({ fit, creator, preferred }) => {
              const cap = fit.capability as Capability;
              const bands = Object.entries(fit.culturalBands as Record<string, BandResult>);
              return (
                <li key={creator.id} className="rounded-xl border bg-card p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: colour }} aria-hidden>
                      {creator.displayName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{creator.displayName}</p>
                      <p className="text-xs text-muted-foreground">{creator.city || (creator.handles as { instagram?: string }).instagram || ""}</p>
                    </div>
                  </div>
                  {(preferred || (fit.hardConstraints as { quoteRequired?: boolean }).quoteRequired) && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {preferred && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">Preferred</span>}
                      {(fit.hardConstraints as { quoteRequired?: boolean }).quoteRequired && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Quote required</span>}
                    </div>
                  )}
                  {creator.proposition && <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{creator.proposition}</p>}
                  <dl className="mt-3 grid gap-1.5 border-t pt-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Relevant past work</dt>
                      <dd className="font-medium">{CAPABILITY_LABEL[cap.level] ?? cap.level}</dd>
                    </div>
                    {bands.length > 0 && <p className="pt-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Culture fit</p>}
                    {bands.map(([k, b]) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{k === "audience" ? "Qloo audience" : k.length <= 2 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1)}</dt>
                        <dd><Strength band={b.band} /></dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
          {shortlist.length > 0 && <p className="text-[11px] text-muted-foreground">Sorted by relevant past work, then your preferred creators, culture fit and price.</p>}
          <Button asChild className="w-full">
            <Link href={`/brand/campaigns/${campaignId}/proposals#${d.id}`}>
              See proposals <ArrowRight className="size-4" />
            </Link>
          </Button>
        </aside>
      </div>

      {discovered.length > 0 && (
        <section className="border-t bg-muted/20 px-6 py-7 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 className="text-[11px] font-semibold tracking-[0.14em] text-info uppercase">Real creators and talent Qloo matched to this direction</h4>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Real people, ranked by how strongly their audience shares this direction&apos;s taste. You haven&apos;t contacted them: each needs a quote.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">Ranked within this direction · no one repeats an earlier direction</span>
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {discovered.map((x) => (
              <DiscoveredTile key={x.id} x={x} colour={colour} intendedAges={intendedAges} added={onRoster.has(x.qlooPersonId)} canAdd={canAdd} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function DiscoveredTile({
  x,
  colour,
  intendedAges,
  added,
  canAdd,
}: {
  x: DirectionEntry["discovered"][number];
  colour: string;
  intendedAges: string[];
  added: boolean;
  canAdd: boolean;
}) {
  const lean = audienceLean(x.audience as CreatorAudience | null);
  const matches = leanMatchesIntended(lean, intendedAges);
  return (
    <li className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold" style={{ borderColor: colour }} aria-hidden>
          {x.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium break-words">{x.name}</p>
          {x.instagram ? (
            <a href={`https://www.instagram.com/${x.instagram}/`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
              <AtSign className="size-3" />
              {x.instagram}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No handle on file</p>
          )}
        </div>
        <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info tabular-nums">#{x.rank} of {x.resultCount}</span>
      </div>
      {x.occupations.length > 0 && (
        <p className="mt-3 text-xs">
          {x.occupations.some((o) => CREATOR_OCCUPATIONS.includes(o)) && <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Creator</span>}
          {x.occupations.slice(0, 3).map(occupationLabel).join(" · ")}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Audience: {describeLean(lean)}
        {matches === true && <span className="ml-1 font-medium text-success">· in your target ages</span>}
        {matches === false && <span className="ml-1">· outside your target ages</span>}
      </p>
      <div className="mt-auto pt-3">
        {added ? (
          <p className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <Check className="size-3.5" /> On your roster
          </p>
        ) : canAdd ? (
          <form action={addDiscoveredAction.bind(null, x.id)}>
            <Button type="submit" size="sm" variant="outline" className="w-full">
              <UserPlus className="size-3.5" /> Add to roster
            </Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

function Block({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3">
      <div>
        <h4 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</h4>
        {aside && <p className="mt-1 text-xs text-muted-foreground">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

const TONE = {
  good: { icon: Check, className: "bg-success-soft text-success" },
  caution: { icon: TriangleAlert, className: "bg-warning-soft text-warning" },
  unknown: { icon: Minus, className: "bg-muted text-muted-foreground" },
};

function tone(answer: string): keyof typeof TONE {
  if (answer === "Yes") return "good";
  if (answer === "Couldn't check" || answer === "Unclear") return "unknown";
  return "caution";
}

const FIT_ANSWER: Record<string, { answer: string; tone: keyof typeof TONE }> = {
  supports: { answer: "Yes, it builds on it", tone: "good" },
  tension: { answer: "There's a tension", tone: "caution" },
  not_covered: { answer: "Your profile doesn't cover it", tone: "unknown" },
};

/** The fourth check: the brand's own research, results and rules, read against this direction. */
function ProfileFitRow({ fit }: { fit: NonNullable<DirectionEntry["profileFit"]> }) {
  const f = FIT_ANSWER[fit.verdict] ?? FIT_ANSWER.not_covered;
  const Icon = TONE[f.tone].icon;
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-2.5 border-t pt-3">
      <span className={`mt-0.5 flex size-6 items-center justify-center rounded-full ${TONE[f.tone].className}`} aria-hidden>
        <Icon className="size-3.5" strokeWidth={2.5} />
      </span>
      <div>
        <dt className="text-xs text-muted-foreground">Does it fit what you know?</dt>
        <dd className="text-sm font-medium">{f.answer}</dd>
        <dd className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-semibold tracking-wide text-accent-foreground uppercase">Insight</span> {fit.note}
        </dd>
        {fit.facts.length > 0 && (
          <dd>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">From your brand profile ({fit.facts.length})</summary>
              <ul className="mt-1.5 grid gap-1.5">
                {fit.facts.map((x) => (
                  <li key={x.id} className="border-l-2 border-info/40 pl-2">
                    {x.text}
                    {x.documentName && (
                      <span className="block text-muted-foreground">
                        {x.documentName}
                        {x.page ? `, p. ${x.page}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </dd>
        )}
      </div>
    </div>
  );
}

function CheckRow({ question, answer, note }: { question: string; answer: string; note?: string }) {
  const t = TONE[tone(answer)];
  const Icon = t.icon;
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-2.5">
      <span className={`mt-0.5 flex size-6 items-center justify-center rounded-full ${t.className}`} aria-hidden>
        <Icon className="size-3.5" strokeWidth={2.5} />
      </span>
      <div>
        <dt className="text-xs text-muted-foreground">{question}</dt>
        <dd className="text-sm font-medium">{answer}</dd>
        {note && <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>}
      </div>
    </div>
  );
}

const STRENGTH: Record<string, number> = { "top quarter": 3, middle: 2, lower: 1 };

/** Culture fit as three bars plus its word, so it reads at a glance and without colour. */
function Strength({ band }: { band: string }) {
  const level = STRENGTH[band] ?? 0;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`w-1 rounded-sm ${n <= level ? "bg-foreground/70" : "bg-border"}`} style={{ height: `${4 + n * 3}px` }} />
        ))}
      </span>
      <span className="w-14 font-medium">{BAND_LABEL[band] ?? band}</span>
    </span>
  );
}

export default function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Strategy params={params} />
    </Suspense>
  );
}
