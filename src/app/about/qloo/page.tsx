import type { Metadata } from "next";
import { Suspense } from "react";
import { ClaimBadge } from "@/components/claims";
import { PublicShell } from "@/components/public-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getQlooUsage, getTracedExample, type CallKind } from "@/lib/views/about";

export const metadata: Metadata = { title: "How Common Ground uses Qloo" };

const CAPABILITIES: { kind: CallKind; stage: string; request: string; purpose: string }[] = [
  { kind: "search", stage: "Looking up names", request: "GET /search", purpose: "Finds the brands, artists, shows and podcasts named in the brief. If a name could mean more than one thing, we ask which one you meant." },
  { kind: "tags", stage: "Looking up names", request: "GET /v2/tags", purpose: "Finds the interests and themes mentioned in the brief." },
  { kind: "audiences", stage: "Looking up names", request: "GET /v2/audiences", purpose: "Finds the audience groups that match how the brief describes your customers." },
  { kind: "taste", stage: "Audience · Checks", request: "GET /v2/insights (tags)", purpose: "The interests, styles and moods people with these tastes share. This is what the creative directions are built from." },
  { kind: "demographics", stage: "Audience · Creators", request: "GET /v2/insights (demographics)", purpose: "The age and gender lean of the people who like each name, shown next to the audience in your brief, and of each creator's audience." },
  { kind: "recommend", stage: "Related interests", request: "GET /v2/insights (entities)", purpose: "What else these people enjoy: artists, podcasts, shows, films, books and brands, with which name in your brief led to each one." },
  { kind: "places", stage: "Related interests", request: "GET /v2/insights (places)", purpose: "Places in each market's city that fit, for local shoot and content ideas." },
  { kind: "score_tags", stage: "Checks · Creators", request: "GET /v2/insights (score tags)", purpose: "Checks whether a direction hangs together and suits your audience, and how well creators' themes fit." },
  { kind: "score_entities", stage: "Creators", request: "GET /v2/insights (score entities)", purpose: "Compares every creator's inspirations, and the audiences of creators Qloo knows, against each direction in one go, so they're ranked fairly." },
  { kind: "creators", stage: "Finding real creators", request: "GET /v2/insights (people)", purpose: "Real creators and talent whose audience shares each direction's taste: people Qloo tags as YouTubers, TikTokers or bloggers, plus the category's own talent (chefs for coffee, runners for running shoes), with their public Instagram handle." },
  { kind: "handles", stage: "Your creators", request: "GET /entities (Instagram handle)", purpose: "Matches the creators you import to Qloo by their public Instagram handle, so their audience can be checked." },
];

const RULES = [
  ["Facts come from code, not the AI", "Each Qloo fact is written by a fixed template straight from the data. The AI picks which facts matter but never writes their wording or numbers."],
  ["The AI's suggestions are labelled", "Anything the AI suggests is marked as an insight and must point to at least one Qloo fact. It can't use numbers, make sales predictions, or say anything about individual people. If it breaks a rule, it's sent back to try again."],
  ["Fair comparisons only", "Qloo's scores only mean something within a single lookup, so we never compare scores from different lookups. Creators are ranked against each other in the same lookup. If Qloo returns nothing for a name, we say “no data”, not zero."],
  ["Three checks on every direction", "Does it hang together? Does it hold up if you remove one thing from the brief? Does it suit the audience you described? Each answer is shown separately."],
] as const;

const GUARDRAILS = [
  "Only public names and public social handles are sent to Qloo. Contact details, rates and notes never are.",
  "A creator's inspirations describe their work, not their followers. A creator's audience lean is Qloo's aggregate data for the people who like them, never about individuals.",
  "A creator's city is only used for practical planning and local ideas, never to judge fit.",
  "Qloo's answers are stored privately on our server and never published.",
];

const LIMITATIONS = [
  "If the brief describes the audience only by age, Qloo can't tell directions apart for that audience, so the audience check shows “couldn't check”.",
  "Qloo's taste data doesn't change by city, so differences between markets come from local places only.",
  "Trend data was flat for the brands we tried, so we don't use it.",
  "Qloo can't filter people by country, so a suggested creator may work outside your market. Check before you reach out.",
  "Qloo knows public creators. Smaller creators you import may not be found; they're still cast on their portfolio and price.",
  "Qloo describes groups of people. Nothing here predicts what one person will buy or how a video will perform.",
];

export default function AboutQlooPage() {
  return (
    <PublicShell>
      <p className="text-sm font-medium text-primary">How we use Qloo</p>
      <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Every fact we show comes from Qloo, and you can check it.</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Qloo knows what people with similar tastes enjoy across music, shows, brands, places and more. Common Ground uses it to find what a brand and a creator have in common. Here is what we ask Qloo, the rules we follow, and one example followed all the way back to Qloo.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">What we ask Qloo</h2>
        <Suspense fallback={<Skeleton className="mt-4 h-96 w-full" />}>
          <CapabilityTable />
        </Suspense>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Would it work without Qloo?</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          We run the same brief twice, the same way each time, except one run gets Qloo&apos;s data and the other doesn&apos;t. You see the two side by side without knowing which is which, then reveal the answer.{" "}
          <a href="/showcase?to=evaluate" className="font-medium text-primary underline underline-offset-2">See it on the example campaign</a>.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">One example, traced back</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">An insight from the example campaign, followed back to the Qloo lookup it came from.</p>
        <Suspense fallback={<Skeleton className="mt-4 h-80 w-full" />}>
          <TracedExample />
        </Suspense>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <h2 className="text-xl font-semibold tracking-tight sm:col-span-2">Our rules</h2>
        {RULES.map(([title, body]) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Privacy and fairness</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {GUARDRAILS.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">What it can&apos;t do</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      </section>
    </PublicShell>
  );
}

async function CapabilityTable() {
  const usage = await getQlooUsage();
  return (
    <>
      {usage && (
        <p className="mt-2 text-sm text-muted-foreground">
          The example campaign made {usage.total} Qloo lookups and kept {usage.evidenceRows} pieces of data.
        </p>
      )}
      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Step</th>
              <th className="px-4 py-2 font-medium">Qloo endpoint</th>
              <th className="px-4 py-2 font-medium">What it is for</th>
              {usage && <th className="px-4 py-2 text-right font-medium">Used in the example</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {CAPABILITIES.map((c) => (
              <tr key={c.kind} className="align-top">
                <td className="px-4 py-3 whitespace-nowrap">{c.stage}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.request}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.purpose}</td>
                {usage && <td className="px-4 py-3 text-right tabular-nums">{usage.byKind.get(c.kind) ?? 0}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const fmt = (n?: number) => (n === undefined ? "—" : n.toFixed(2));

async function TracedExample() {
  const ex = await getTracedExample();
  if (!ex) return <p className="mt-4 text-sm text-muted-foreground">The example campaign isn&apos;t ready yet. Check back soon.</p>;
  const label = (id: string) => ex.labels.get(id);
  const shownParams = Object.entries(ex.call.params).filter(([k]) => k !== "take" && k !== "page");

  return (
    <ol className="mt-6 grid gap-4 lg:grid-cols-2">
      <Step n={1} title="What we asked Qloo">
        <p className="font-mono text-xs">GET {ex.call.endpoint}</p>
        <dl className="mt-2 grid gap-1 font-mono text-xs">
          {shownParams.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,14rem)_1fr] gap-2">
              <dt className="truncate text-muted-foreground">{k}</dt>
              <dd className="break-all">
                {v.split(",").map((id) => (label(id) ? `${label(id)} (${id.startsWith("urn:") ? id : `${id.slice(0, 8)}…`})` : id)).join(", ")}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">API key not shown</p>
      </Step>
      <Step n={2} title="What Qloo sent back">
        <ul className="grid gap-1.5 text-sm">
          {ex.results.map((r) => (
            <li key={r.id} className={`flex items-baseline gap-2 ${r.id === ex.evidenceId ? "font-medium" : "text-muted-foreground"}`}>
              <span className="w-8 shrink-0 tabular-nums text-xs">#{r.rank}</span>
              <span className="flex-1">{r.label}</span>
              <span className="tabular-nums text-xs">score {fmt(r.values.affinity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Scores only compare within this one lookup.</p>
      </Step>
      <Step n={3} title="The fact we show, written by code">
        <div className="flex items-start gap-2">
          <ClaimBadge kind="finding" />
          <p className="text-sm">{ex.finding}</p>
        </div>
      </Step>
      <Step n={4} title="The insight, written by the AI">
        <div className="flex items-start gap-2">
          <ClaimBadge kind="interpretation" />
          <p className="text-sm">{ex.interpretation}</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          From the direction “{ex.direction}” in the{" "}
          <a href="/showcase" className="underline underline-offset-2">example campaign</a>.
        </p>
      </Step>
    </ol>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground">Step {n}</p>
      <h3 className="mt-0.5 font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </li>
  );
}
