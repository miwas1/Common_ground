import { ArrowRight, ChevronRight, CircleAlert, CircleCheck, CirclePause, FileText, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { RunPoller } from "@/components/run-poller";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { pageActor } from "@/lib/auth/page";
import { findShowcase } from "@/lib/demo/showcase";
import { formatMoney } from "@/lib/pipeline/money";
import { getDashboard, type CampaignState, type DashboardCampaign } from "@/lib/views/dashboard";
import { CAMPAIGN_TYPE_LABEL } from "@/lib/views/labels";

const STATE: Record<CampaignState, { label: string; icon: typeof CircleCheck; pill: string; bar: string }> = {
  researching: { label: "Researching", icon: LoaderCircle, pill: "bg-primary/10 text-primary", bar: "bg-primary" },
  needs_answer: { label: "Needs your answer", icon: CirclePause, pill: "bg-warning-soft text-warning", bar: "bg-warning" },
  stopped: { label: "Stopped", icon: CircleAlert, pill: "bg-destructive/10 text-destructive", bar: "bg-destructive" },
  ready: { label: "Ready to review", icon: CircleCheck, pill: "bg-success-soft text-success", bar: "bg-success" },
  draft: { label: "Draft", icon: FileText, pill: "bg-muted text-muted-foreground", bar: "bg-border" },
};

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function Dashboard() {
  const actor = await pageActor();
  const { userName, organization, campaigns } = await getDashboard(actor.userId);
  const showcase = await findShowcase(await getDb());
  const firstName = userName.split(" ")[0];

  const researching = campaigns.filter((c) => c.state === "researching").length;
  const attention = campaigns.filter((c) => c.state === "needs_answer" || c.state === "stopped");
  const proposalsReady = campaigns.filter((c) => c.state === "ready").reduce((n, c) => n + c.proposals, 0);

  return (
    <div className="grid gap-10">
      <RunPoller active={researching > 0} intervalMs={5000} />

      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          {organization && <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{organization}</p>}
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{firstName ? `Welcome back, ${firstName}` : "Your campaigns"}</h1>
          <p className="mt-2 text-muted-foreground">
            {campaigns.length === 0 ? "Start a campaign and we'll research it for you." : "Here's where your campaigns stand."}
          </p>
        </div>
        <Button asChild size="lg" className="h-11 px-5">
          <Link href="/brand/campaigns/new">
            <Plus className="size-4" /> New campaign
          </Link>
        </Button>
      </header>

      {campaigns.length > 0 && (
        <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-border gap-px lg:grid-cols-4">
          <Stat label="Campaigns" value={campaigns.length} />
          <Stat label="Researching now" value={researching} live={researching > 0} />
          <Stat label="Need your answer" value={attention.length} tone={attention.length > 0 ? "warning" : undefined} />
          <Stat label="Proposals ready" value={proposalsReady} />
        </dl>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <section className="grid content-start gap-4">
          {attention.length > 0 && (
            <div className="rounded-2xl border border-warning/25 bg-warning-soft/60 p-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-warning uppercase">Waiting on you</p>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {attention.map((c) => (
                  <li key={c.id}>
                    <Link href={`/brand/campaigns/${c.id}`} className="group inline-flex items-center gap-1.5 font-medium hover:underline">
                      {c.name}
                      <span className="font-normal text-muted-foreground">
                        · {c.state === "needs_answer" ? "pick what a name in your brief means" : "the research stopped; try again"}
                      </span>
                      <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">All campaigns</h2>
            {campaigns.length > 0 && <span className="text-xs text-muted-foreground">{campaigns.length} total</span>}
          </div>

          {campaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid gap-3">
              {campaigns.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-4">
          {showcase && (
            <Link href={`/brand/campaigns/${showcase.id}`} className="group block overflow-hidden rounded-2xl bg-foreground text-background">
              <div className="flex gap-1.5 px-5 pt-5" aria-hidden>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="h-1.5 flex-1 rounded-full" style={{ background: `var(--direction-${n})` }} />
                ))}
              </div>
              <div className="p-5">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-background/60 uppercase">Example · view only</p>
                <p className="mt-2 font-display text-2xl leading-tight">Cold brew concentrate launch</p>
                <p className="mt-2 text-sm text-background/70">A finished campaign: four creative directions, creator proposals with prices, and budget options.</p>
                <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                  Look around <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </p>
              </div>
            </Link>
          )}

          <div className="rounded-2xl border bg-card p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">How a campaign runs</p>
            <ol className="mt-3 grid gap-3 text-sm">
              {[
                ["Write the brief", "Product, goal, budget and what you know about your customers."],
                ["We research it", "A web read of your market, then Qloo's taste data. Takes a few minutes."],
                ["Pick and brief creators", "Directions, matched creators, priced proposals and budget options."],
              ].map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[1.5rem_1fr] gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/about/qloo" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              How we use Qloo <ChevronRight className="size-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, live = false, tone }: { label: string; value: number; live?: boolean; tone?: "warning" }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {live && <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden />}
        {label}
      </dt>
      <dd className={`mt-1 font-display text-4xl leading-none tabular-nums ${tone === "warning" ? "text-warning" : ""}`}>{value}</dd>
    </div>
  );
}

function CampaignRow({ c }: { c: DashboardCampaign }) {
  const s = STATE[c.state];
  const Icon = s.icon;
  const meta = [c.markets.join(", "), c.campaignType ? CAMPAIGN_TYPE_LABEL[c.campaignType] : null, c.budgetCents ? `${formatMoney(c.budgetCents, c.currency)} budget` : null].filter(Boolean);
  return (
    <li>
      <Link
        href={`/brand/campaigns/${c.id}`}
        className="group relative grid gap-4 overflow-hidden rounded-2xl border bg-card p-5 pl-6 transition hover:border-foreground/20 hover:shadow-[0_12px_32px_-20px_rgb(0_0_0/0.25)] sm:grid-cols-[1fr_auto] sm:items-center"
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.pill}`}>
              <Icon className={`size-3.5 ${c.state === "researching" ? "motion-safe:animate-spin" : ""}`} aria-hidden />
              {s.label}
            </span>
            {c.version > 1 && <span className="text-xs text-muted-foreground">Version {c.version}</span>}
            <span className="text-xs text-muted-foreground">Started {date.format(c.createdAt)}</span>
          </div>
          <p className="mt-2 truncate text-lg font-semibold tracking-tight">{c.name}</p>
          <p className="truncate text-sm text-muted-foreground">{[c.brand, c.product].filter(Boolean).join(" · ")}</p>
          {meta.length > 0 && <p className="mt-1 text-xs text-muted-foreground/80">{meta.join(" · ")}</p>}
          {c.progress && (
            <div className="mt-3 grid max-w-md gap-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(4, (c.progress.done / c.progress.total) * 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                Step {Math.min(c.progress.done + 1, c.progress.total)} of {c.progress.total}
                {c.progress.current ? ` · ${c.progress.current}` : ""}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          {c.state === "ready" && (
            <dl className="flex gap-6 text-center">
              <Count label="Directions" value={c.directions} />
              <Count label="Creators" value={c.creators} />
              <Count label="Proposals" value={c.proposals} />
            </dl>
          )}
          <ChevronRight className="hidden size-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground sm:block" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="font-display text-2xl leading-none tabular-nums">{value}</dd>
      <dt className="mt-1 text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <svg viewBox="0 0 64 40" className="h-12 w-20" aria-hidden>
        <circle cx="24" cy="20" r="16" fill="none" stroke="var(--direction-1)" strokeWidth="3" />
        <circle cx="40" cy="20" r="16" fill="none" stroke="var(--primary)" strokeWidth="3" />
      </svg>
      <div>
        <p className="font-display text-2xl">Start your first campaign</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tell us about your product, your customers and the content you need. We&apos;ll suggest creative directions and the creators to make them.
        </p>
      </div>
      <Button asChild>
        <Link href="/brand/campaigns/new">
          <Plus className="size-4" /> New campaign
        </Link>
      </Button>
    </div>
  );
}

export default function BrandHome() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Dashboard />
      </Suspense>
    </AppShell>
  );
}
