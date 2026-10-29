import Link from "next/link";
import { signInAsDemo } from "@/app/actions";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Tell us about your brand",
    body: "Your product, what you want the campaign to do, your budget, and what you know about your customers, including the brands, shows and artists they love.",
  },
  {
    title: "We research their tastes",
    body: "Qloo's data shows what else people with those tastes enjoy: music, shows, podcasts, places and brands. If a name could mean two things, we ask.",
  },
  {
    title: "Get creative directions",
    body: "Three or four directions for your campaign, each with a clear idea, the look and feel, and the data behind it.",
  },
  {
    title: "Meet the right creators",
    body: "Real creators Qloo matched to each direction, and your own roster ranked the same way, with ready-to-pitch proposals and budget options.",
  },
];

const features = [
  ["Creative directions", "Each direction comes with who it speaks to, where your product fits, scene ideas and the look and feel."],
  ["Real creators, found by Qloo", "For each direction, Qloo names real creators whose audience shares its taste, with their Instagram handle and their audience's age and gender lean."],
  ["See the evidence", "Every insight shows the Qloo data it's based on, so you know why a direction or creator was suggested."],
  ["Try a change", "Remove something from the brief or change the budget, and get a new version you can compare with the old one."],
  ["Budget options", "Several ways to spend your budget, built from each creator's actual price."],
  ["With or without Qloo", "Run the same brief without Qloo's data and compare the two blind, so you can judge what it adds."],
  ["Your own creators", "Import your roster from a spreadsheet. Each creator is checked against Qloo and ranked for every direction. No quote yet? They stay in as “Quote required”."],
  ["Briefs you can share", "Each proposal becomes a clean brief you can print, save as a PDF or send to the creator."],
] as const;

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
    who: "Moving into a new market",
    situation: "A skincare brand that sells well in the UK wants to reach the same kind of customer in the US.",
    give: "The brands, artists and shows its UK customers love, and the US as the market.",
    get: "What people with those tastes also enjoy, so the campaign speaks their language instead of copying the UK one.",
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
  ["Data and opinions are kept apart", "Facts from Qloo's data are labelled as such. The AI's suggestions are labelled as insights, and each one points to the data behind it."],
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
              Tell us about your brand and your customers. Common Ground finds what else they love, suggests creative
              directions for your campaign, and matches you with creators who fit, each with a proposal and a price.
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

      {/* ── Who it's for ─────────────────────────────────────── */}
      <section className="border-b bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-8 md:grid-cols-3">
          <Stat figure="One brief" label="is all you write. Made for brand and agency teams who work with creators." />
          <Stat figure="3–4 directions" label="come back, each built around what your customers already love." />
          <Stat figure="Ready-to-pitch proposals" label="with the creator, the idea, what gets made and the price, plus the reasons behind each one." />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-16">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-8">
          <SectionHead kicker="How it works" title="From a brief to creator proposals" />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-4">
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
          <dl className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(([title, body], i) => (
              <div key={title} className="border-t pt-5">
                <span
                  aria-hidden
                  className="block h-1 w-8 rounded-full"
                  style={{ background: `var(--direction-${(i % 4) + 1})` }}
                />
                <dt className="mt-4 font-semibold">{title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</dd>
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
            The demo uses a made-up coffee brand and made-up creators. The research uses real Qloo data.
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

/** A static sketch of a direction card: what one looks like, not real Qloo output. */
function DirectionBoard() {
  const worlds = [
    ["Music", "Lo-fi and ambient producers"],
    ["Shows", "Slow-TV and craft documentaries"],
    ["Places", "Neighbourhood roasters, bike cafés"],
  ];
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
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Passed all 3 checks</span>
        </div>
        <h3 className="mt-3 font-display text-3xl leading-tight">The Unhurried Morning</h3>
        <p className="mt-1 text-sm text-muted-foreground">Slow rituals, considered objects, craft over speed.</p>

        <ul className="mt-5 grid gap-2">
          {worlds.map(([k, v]) => (
            <li key={k} className="flex items-baseline gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{k}</span>
              {v}
            </li>
          ))}
        </ul>

        <div className="mt-5 grid gap-2 text-sm">
          <p className="rounded-lg border-l-2 border-info bg-info-soft px-3 py-2">
            <span className="block text-[11px] font-semibold tracking-wide text-info uppercase">Qloo data</span>
            Fans of the brands in your brief lean towards slow-living interests.
          </p>
          <p className="rounded-lg border-l-2 border-direction-3 bg-accent px-3 py-2">
            <span className="block text-[11px] font-semibold tracking-wide text-accent-foreground uppercase">Insight</span>
            Position the product as part of a ritual, not a shortcut.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t pt-4">
          <div className="flex -space-x-2">
            {[1, 2, 3].map((n) => (
              <span key={n} className="size-7 rounded-full border-2 border-card" style={{ background: `var(--direction-${n + 1})` }} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">3 creators matched · 2 proposals with prices</span>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs text-muted-foreground">Example of a creative direction</figcaption>
    </figure>
  );
}
