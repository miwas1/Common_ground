import Link from "next/link";
import { signInAsDemo } from "@/app/actions";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Read the audience",
    body: "Qloo taste analysis and demographic affinity for the brands, artists and shows your customers mention, shown beside what your team already knows.",
  },
  {
    title: "Find the cultural directions",
    body: "Cross-category worlds (music, shows, podcasts, places, brands) grouped into a few directions worth testing, each checked for coherence, input sensitivity and relevance.",
  },
  {
    title: "Cast and propose",
    body: "Creators matched to each direction on their portfolio and cultural fit, then written up as complete proposals with an evidence trail and budget packages from real quotes.",
  },
];

const principles = [
  ["Findings vs interpretations", "Qloo findings are written by code from stored results. The model's readings are labelled as interpretations and must cite them."],
  ["Honest comparisons", "Affinity is normalised per query, so scores are only compared within one query. What Qloo didn't return is “not measured”, never zero."],
  ["Research that keeps going", "Each run is a durable workflow: it survives closing the tab, retries failed steps, and stops to ask when a name in the brief is ambiguous."],
] as const;

export default function Home() {
  return (
    <PublicShell>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Discover the cultural worlds your customers care about.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Common Ground is an AI creative strategist and casting agent. It finds creators who can work authentically in those worlds, and turns each partnership into a campaign proposal worth testing.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {/* A plain link: /showcase signs visitors in to the demo, so it must never be prefetched. */}
        <Button size="lg" asChild>
          <a href="/showcase">Open the finished showcase</a>
        </Button>
        <form action={signInAsDemo}>
          <Button size="lg" type="submit" variant="outline">Run it on a new brief</Button>
        </form>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">No sign-up. A demo brand account with a fictional brand and creator roster; research runs on real Qloo data.</p>

      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={step.title} className="rounded-xl border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground">Step {i + 1}</p>
            <h2 className="mt-1 font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">Built to be checked</h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-3">
          {principles.map(([title, body]) => (
            <div key={title}>
              <dt className="font-medium">{title}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-sm">
          <Link href="/about/qloo" className="font-medium text-primary underline-offset-4 hover:underline">
            See every Qloo capability it uses, and one claim traced back to its request →
          </Link>
        </p>
      </section>
    </PublicShell>
  );
}
