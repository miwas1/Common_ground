import {
  ArrowRight,
  BookOpen,
  Check,
  Columns3,
  Compass,
  Contact,
  FileText,
  PenLine,
  Quote,
  Scale,
  Search,
  ShieldCheck,
  Timer,
  TriangleAlert,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { signInAsDemo } from "@/app/actions";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Tell us about your brand",
    body: "Your product, your goal, your budget and what you know about your customers, or upload your customer research once and reuse it in every brief.",
  },
  {
    title: "We research their tastes",
    body: "We read up on your brand and market, then Qloo's data shows what else people with those tastes enjoy: music, shows, podcasts, places and brands.",
  },
  {
    title: "Get creative directions",
    body: "Three or four directions, each with a clear idea, the look and feel, the data behind it, and a check against what your own research says.",
  },
  {
    title: "Meet the right creators",
    body: "Real creators Qloo matched to each direction and your own roster ranked the same way, with ready-to-pitch proposals and budget options.",
  },
];

const features: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Compass, title: "Creative directions", body: "Who each direction speaks to, where your product fits, scenes to shoot and the look and feel." },
  { icon: UsersRound, title: "Real creators, found by Qloo", body: "People whose audience shares each direction's taste, with their Instagram handle and audience lean." },
  { icon: Contact, title: "Your own creators", body: "Import your roster from a spreadsheet. Everyone is checked against Qloo and ranked for each direction." },
  { icon: BookOpen, title: "Your brand profile", body: "Upload research once. What customers said, what your team believes and what past campaigns showed, kept apart." },
  { icon: ShieldCheck, title: "Checked against what you know", body: "If customers told you convenience beats craftsmanship, a craft-led idea gets flagged, with the passage." },
  { icon: Search, title: "See the evidence", body: "Every insight shows the Qloo data it rests on, so you know why a direction or creator was suggested." },
  { icon: PenLine, title: "Change one thing, keep the rest", body: "Edit a proposal, ask for a simpler version or swap the creator, without redoing the research." },
  { icon: Columns3, title: "Compare side by side", body: "Put two or three proposals next to each other: idea, story, deliverables, price and fit." },
  { icon: Wallet, title: "Budget options", body: "Ways to spend your budget from each creator's real price. Try another budget and they change instantly." },
  { icon: Scale, title: "With or without Qloo", body: "Run the same brief without Qloo's data and compare the two blind, so you can judge what it adds." },
  { icon: FileText, title: "Briefs you can share", body: "Each proposal becomes a clean brief to print, save as a PDF or send to the creator." },
  { icon: Timer, title: "Watch it work", body: "Live progress with a time estimate. Close the tab and come back: the research keeps going." },
];

/** Situations a brand or agency team is in, what they type in, and what they leave with. */
const useCases = [
  {
    who: "Launching a new product",
    situation: "A coffee brand is launching a cold brew and needs creator videos for paid social, but doesn't know which angle to lead with.",
    give: "The product, the budget, and the brands and shows customers mentioned in interviews.",
    get: "Several creative directions, each with matched creators and priced proposals, plus budget options to test which one is worth scaling.",
    demo: true,
  },
  {
    who: "Pitching a client",
    situation: "An agency has a pitch on Friday and needs creator ideas it can defend when the client asks \"why this creator?\".",
    give: "The client's brief and the references from their customer research.",
    get: "Directions and proposals with the reasons attached, plus briefs to print or save as a PDF for the deck.",
  },
  {
    who: "Your second campaign",
    situation: "The team ran a campaign last quarter and doesn't want to explain the brand, the customers and the rules all over again.",
    give: "Nothing new: your brand profile already holds your research, results and rules.",
    get: "A brief prefilled from what you already know, and directions checked against it before you commit.",
  },
  {
    who: "Checking a hunch",
    situation: "The team is sure their customers are into outdoor sport. Nobody has checked.",
    give: "The hunch, marked as a guess, alongside what you actually know.",
    get: "Directions that show which ideas lean on the guess, and a second version without it to compare.",
  },
  {
    who: "Spending a small budget well",
    situation: "A founder has a few thousand to spend on creators and can't afford to back the wrong idea.",
    give: "The real budget and what needs to be made.",
    get: "Budget options built from each creator's price: go all in on one idea, or test several cheaply first.",
  },
  {
    who: "Briefing creators",
    situation: "The creators are picked. Now each one needs a clear brief so the content comes back on target.",
    give: "Nothing new. It's built from the proposal.",
    get: "A one-page brief with the idea, opening line, what gets made, the price and what's still to agree.",
  },
] as const;

const principles = [
  ["Sources are kept apart", "Qloo's data, your own research and the AI's suggestions are each labelled, and every suggestion points to what it's based on."],
  ["Nothing made up", "The AI can only point to data that actually came back from Qloo for your brief. If there's no data, it says so instead of guessing."],
  ["About groups, not people", "Qloo describes the shared tastes of groups of people. Nothing here tracks or predicts what one person will do."],
] as const;

export default function Home() {
  return (
    <PublicShell bleed>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-direction-2" />
              Creator campaigns, planned with Qloo&apos;s taste data
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Find the common ground between your brand and{" "}
              <em className="text-primary">the culture your customers live in.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Tell us about your brand and your customers. Common Ground finds what else they love, suggests creative directions, checks them against
              your own research, and finds real creators whose audience fits, each with a proposal and a price.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* A plain link: /showcase signs visitors in to the demo, so it must never be prefetched. */}
              <Button size="lg" className="h-11 px-5 text-base" asChild>
                <a href="/showcase">See the live demo →</a>
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-5 text-base" asChild>
                <Link href="/sign-up">Create an account</Link>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              The demo opens a finished example. No sign-up needed. Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">Log in</Link>
            </p>
          </div>
          <DirectionBoard />
        </div>
      </section>

      {/* ── At a glance ──────────────────────────────────────── */}
      <section className="border-b bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          <Stat figure="One brief" label="is all you write. Made for brand and agency teams who work with creators." />
          <Stat figure="3–4 directions" label="come back, each built around what your customers already love." />
          <Stat figure="Real creators" label="whose audience shares each direction's taste, named by Qloo, plus your own roster." />
          <Stat figure="Your research" label="kept in one place, reused in every brief and checked against every idea." />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-16">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
          <SectionHead kicker="How it works" title="From a brief to creator proposals" />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col bg-card p-6">
                <span className="font-display text-4xl text-primary">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
            Not sure about something? Change it, and you get a new version to compare with the first.
          </p>
        </div>
      </section>

      {/* ── Inside the product ───────────────────────────────── */}
      <section id="inside" className="scroll-mt-16 border-t bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-24 px-4 py-24 sm:px-8">
          <SectionHead kicker="Inside the product" title="Three things a creative brief tool usually can't do" />
          <Spotlight
            kicker="Real creators"
            title="Real people whose audience shares the taste"
            body="For every direction, Qloo names creators and talent whose audience overlaps with it: food creators for a coffee brand, marathon runners for a running shoe."
            points={["Their Instagram handle and their audience's age and gender lean", "Ranked within each direction, never across directions", "Add anyone to your roster in one click; no quote yet means “Quote required”"]}
            preview={<CreatorsPreview />}
          />
          <Spotlight
            reverse
            kicker="Your research"
            title="Checked against what you already know"
            body="Upload customer research once. Every direction is checked against it, so an idea that pulls against what your customers told you is flagged, with the passage that says so."
            points={["What customers said, what your team believes and what past campaigns showed, kept apart", "Every statement links to the page it came from", "Approved statements prefill your next brief"]}
            preview={<ProfilePreview />}
          />
          <Spotlight
            kicker="Control"
            title="Change one thing, keep the rest"
            body="Edit a proposal, ask for a simpler version of the same idea, or swap the creator. The research isn't redone and nothing is overwritten."
            points={["Every change is a new version, credited to whoever made it", "Compare proposals side by side", "Try a different budget and see the options change instantly"]}
            preview={<VersionsPreview />}
          />
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────── */}
      <section id="use-cases" className="scroll-mt-16 border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
          <SectionHead kicker="Use cases" title="What teams use it for" />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {useCases.map((u, i) => (
              <article key={u.who} className="flex flex-col rounded-2xl border bg-card p-6">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--direction-${(i % 4) + 1})` }} />
                  <h3 className="font-semibold">{u.who}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed">{u.situation}</p>
                <dl className="mt-5 grid gap-3 border-t pt-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">You give</dt>
                    <dd className="mt-0.5 leading-relaxed text-muted-foreground">{u.give}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">You get</dt>
                    <dd className="mt-0.5 leading-relaxed">{u.get}</dd>
                  </div>
                </dl>
                {"demo" in u && (
                  <a href="/showcase" className="mt-auto pt-5 text-sm font-medium text-primary underline-offset-4 hover:underline">
                    This is the demo. Open it →
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 border-y bg-card">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
          <SectionHead kicker="Features" title="Everything you need to pick creators and brief them" />
          <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="bg-card p-6">
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in oklab, var(--direction-${(i % 4) + 1}) 14%, transparent)`, color: `var(--direction-${(i % 4) + 1})` }}
                >
                  <Icon className="size-[18px]" strokeWidth={2} />
                </span>
                <dt className="mt-4 font-semibold">{title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Built to be checked ──────────────────────────────── */}
      <section>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <SectionHead kicker="Why you can trust it" title="Suggestions you can check" />
            <Link href="/about/qloo" className="mt-6 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
              How we use Qloo, step by step →
            </Link>
          </div>
          <dl className="grid gap-6 sm:grid-cols-3">
            {principles.map(([title, body]) => (
              <div key={title} className="rounded-xl border bg-card p-5">
                <dt className="font-medium">{title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Closing call to action ───────────────────────────── */}
      <section className="px-4 pb-20 sm:px-8">
        <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-background sm:px-12">
          <h2 className="max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
            See a finished campaign, or try it on your own brand.
          </h2>
          <p className="mt-4 max-w-xl text-background/70">
            The demo uses a made-up coffee brand, a made-up roster and a made-up research document. The research and the real creators come from Qloo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="h-11 bg-background px-5 text-base text-foreground hover:bg-background/90" asChild>
              <a href="/showcase">Open the demo</a>
            </Button>
            <form action={signInAsDemo}>
              <Button size="lg" type="submit" variant="ghost" className="h-11 border border-background/30 px-5 text-base text-background hover:bg-background/10 hover:text-background">
                Try a new brief in the demo
              </Button>
            </form>
            <Button size="lg" variant="ghost" className="h-11 px-5 text-base text-background hover:bg-background/10 hover:text-background" asChild>
              <Link href="/sign-up">Sign up →</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{kicker}</p>
      <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">{title}</h2>
    </div>
  );
}

function Stat({ figure, label }: { figure: string; label: string }) {
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      <span className="block font-display text-3xl text-foreground">{figure}</span>
      {label}
    </p>
  );
}

/** One feature told in words on one side and shown as a preview of the app on the other. */
function Spotlight({
  kicker,
  title,
  body,
  points,
  preview,
  reverse = false,
}: {
  kicker: string;
  title: string;
  body: string;
  points: string[];
  preview: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{kicker}</p>
        <h3 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{title}</h3>
        <p className="mt-4 max-w-lg leading-relaxed text-muted-foreground">{body}</p>
        <ul className="mt-6 grid gap-2.5 text-sm">
          {points.map((p) => (
            <li key={p} className="grid grid-cols-[1.25rem_1fr] gap-2">
              <Check className="mt-0.5 size-4 text-success" strokeWidth={2.5} aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <figure className={reverse ? "lg:order-1" : ""}>
        <div className="rounded-2xl border bg-background p-4 shadow-[0_24px_60px_-34px_rgb(32_33_36/0.35)] sm:p-6">{preview}</div>
        <figcaption className="mt-3 text-center text-xs text-muted-foreground">Illustration of the app. Names here are made up.</figcaption>
      </figure>
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");

function CreatorsPreview() {
  const people = [
    { name: "Dana Okafor", handle: "danacooks", jobs: "Cookbook writer · YouTuber", lean: "ages 25–34 · female", fits: true },
    { name: "Theo Marsh", handle: "theobakes", jobs: "Baker · TikToker", lean: "ages 25–29", fits: true },
    { name: "Priya Lane", handle: "priyaathome", jobs: "Food stylist · Photographer", lean: "ages 35–44 · female", fits: false },
    { name: "Jun Park", handle: "junbrews", jobs: "Coffee YouTuber", lean: "ages 30–34 · male", fits: true },
  ];
  return (
    <div aria-hidden>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-info uppercase">Real creators Qloo matched to this direction</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {people.map((p, i) => (
          <li key={p.name} className={`rounded-xl border bg-card p-3.5 ${i > 1 ? "hidden sm:block" : ""}`}>
            <div className="flex items-start gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-direction-1 text-[11px] font-semibold">{initials(p.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">@{p.handle}</p>
              </div>
              <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">#{i + 1} of 8</span>
            </div>
            <p className="mt-2 text-xs">
              <span className="mr-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Creator</span>
              {p.jobs}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Audience: {p.lean}
              {p.fits && <span className="font-medium text-success"> · in your target ages</span>}
            </p>
            <p className="mt-2.5 rounded-md border py-1 text-center text-xs font-medium">+ Add to roster</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfilePreview() {
  return (
    <div aria-hidden className="grid gap-3">
      <div className="rounded-xl border bg-card p-4">
        <p className="inline-flex rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-medium text-info">From customer research</p>
        <p className="mt-2.5 text-sm">Craftsmanship matters less to customers than speed and price.</p>
        <p className="mt-2 border-l-2 border-info/40 pl-2.5 text-xs text-muted-foreground">
          <Quote className="mr-1 inline size-3" />
          “craftsmanship mattered less to them than speed and price” · Customer interviews, p. 1
        </p>
      </div>
      <div className="rounded-xl bg-muted/60 p-4">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Checks · The Hand-Pulled Hour</p>
        <div className="mt-3 grid grid-cols-[1.5rem_1fr] gap-2.5">
          <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-3.5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Does it hang together?</p>
            <p className="text-sm font-medium">Yes</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[1.5rem_1fr] gap-2.5 border-t pt-3">
          <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-warning-soft text-warning">
            <TriangleAlert className="size-3.5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Does it fit what you know?</p>
            <p className="text-sm font-medium">There&apos;s a tension</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-semibold tracking-wide text-accent-foreground uppercase">Insight</span> This direction leans on craft, but customers say speed and price
              matter more. Test a quicker, everyday version alongside it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VersionsPreview() {
  const versions = [
    { n: "v3", note: "Edited by you: opening line, deliverables", who: "You · today", current: true },
    { n: "v2", note: "Same idea, simpler production: one location, phone shot, four beats", who: "Agent · today" },
    { n: "v1", note: "Drafted by the agent", who: "Agent · yesterday" },
  ];
  return (
    <div aria-hidden className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {["Edit", "Simpler version", "Swap creator"].map((b) => (
          <span key={b} className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium">{b}</span>
        ))}
        <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Open brief to share</span>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">Versions</p>
        <p className="text-xs text-muted-foreground">Every change is a new version. Nothing is overwritten.</p>
        <ol className="mt-3 grid gap-2.5">
          {versions.map((v) => (
            <li key={v.n} className="grid grid-cols-[2.25rem_1fr] gap-2 text-sm">
              <span className={`flex h-6 items-center justify-center rounded-md text-xs font-medium ${v.current ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{v.n}</span>
              <div>
                <p>{v.note}</p>
                <p className="text-xs text-muted-foreground">{v.who}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm">
        <span>Showing options for <span className="font-medium">$6,000</span> instead of $12,000. Nothing is saved.</span>
        <ArrowRight className="size-4 shrink-0 text-info" />
      </div>
    </div>
  );
}

/** A static sketch of a direction card: what one looks like, not real Qloo output. */
function DirectionBoard() {
  const worlds = [
    ["Music", "Lo-fi and ambient producers"],
    ["Shows", "Slow-TV and craft documentaries"],
    ["Places", "Neighbourhood roasters, bike cafés"],
  ];
  const checks = ["Hangs together", "Holds up", "Suits your audience", "Fits your research"];
  return (
    <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="absolute -top-4 -right-3 h-full w-full rotate-3 rounded-2xl border bg-card/60" />
      <div aria-hidden className="absolute -top-2 -right-1.5 h-full w-full rotate-[1.5deg] rounded-2xl border bg-card/80" />
      <div className="relative rounded-2xl border bg-card p-6 shadow-[0_24px_60px_-30px_rgb(32_33_36/0.35)]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="size-2 rounded-full bg-direction-1" />
            Direction 1 of 3
          </span>
          <span className="text-[11px] text-muted-foreground">Passed 4 of 4 checks</span>
        </div>
        <h3 className="mt-3 font-display text-3xl leading-tight">The Unhurried Morning</h3>
        <p className="mt-1 text-sm text-muted-foreground">Slow rituals, considered objects, a calm start before work.</p>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {checks.map((label) => (
            <li key={label} className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
              <Check className="size-3" strokeWidth={3} /> {label}
            </li>
          ))}
        </ul>

        <ul className="mt-4 grid gap-2">
          {worlds.map(([k, v]) => (
            <li key={k} className="flex items-baseline gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{k}</span>
              {v}
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-2 text-sm">
          <p className="rounded-lg border-l-2 border-info bg-info-soft px-3 py-2">
            <span className="block text-[11px] font-semibold tracking-wide text-info uppercase">Qloo data</span>
            Fans of the brands in your brief lean towards slow-living interests.
          </p>
          <p className="rounded-lg border-l-2 border-direction-3 bg-accent px-3 py-2">
            <span className="block text-[11px] font-semibold tracking-wide text-accent-foreground uppercase">Insight</span>
            Position the product as part of a ritual, not a shortcut.
          </p>
        </div>

        <div className="mt-4 border-t pt-4">
          <p className="text-[11px] font-semibold tracking-wide text-info uppercase">Real creators matched</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Dana Okafor", "Theo Marsh", "Jun Park"].map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs">
                <span className="flex size-5 items-center justify-center rounded-full bg-direction-2 text-[9px] font-semibold text-white">{initials(n)}</span>
                {n}
              </span>
            ))}
            <span className="self-center text-xs text-muted-foreground">+5 more</span>
          </div>
        </div>
      </div>
      <figcaption className="relative z-10 mt-8 text-center text-xs text-muted-foreground">Example of a creative direction. Names are made up.</figcaption>
    </figure>
  );
}
