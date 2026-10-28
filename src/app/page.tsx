import Link from "next/link";
import { signInAsDemo } from "@/app/actions";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Read the audience",
    body: "Qloo taste analysis and demographic affinity, checked against what your team already knows.",
  },
  {
    title: "Find the cultural directions",
    body: "Cross-category worlds — music, shows, podcasts, places, brands — grouped into a few directions worth testing.",
  },
  {
    title: "Cast and propose",
    body: "Creators scored against each direction, then written up as complete proposals with evidence and cost.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-16 sm:px-8 sm:py-24">
      <p className="text-sm font-medium text-primary">Common Ground</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Discover the cultural worlds your customers care about.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Find creators who can work authentically in those worlds, and turn each
        partnership into a campaign worth testing.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <form action={signInAsDemo.bind(null, "brand")}>
          <Button size="lg" type="submit">Enter as brand</Button>
        </form>
        <form action={signInAsDemo.bind(null, "creator")}>
          <Button size="lg" type="submit" variant="outline">Enter as creator</Button>
        </form>
        <Button size="lg" variant="ghost" asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>

      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="rounded-xl border bg-card p-5"
          >
            <p className="text-xs font-medium text-muted-foreground">
              Step {i + 1}
            </p>
            <h2 className="mt-1 font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-16 text-xs text-muted-foreground">
        Cultural evidence from the Qloo Taste AI API. Qloo results describe
        aggregate affinities, not individual people.
      </p>
    </main>
  );
}
