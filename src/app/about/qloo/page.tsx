import type { Metadata } from "next";
import { Suspense } from "react";
import { ClaimBadge } from "@/components/claims";
import { PublicShell } from "@/components/public-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getQlooUsage, getTracedExample, type CallKind } from "@/lib/views/about";

export const metadata: Metadata = { title: "How Common Ground uses Qloo" };

const CAPABILITIES: { kind: CallKind; stage: string; request: string; purpose: string }[] = [
  { kind: "search", stage: "Resolve", request: "GET /search", purpose: "Matches the public brands, artists, shows and podcasts named in the brief. Search is fuzzy, so ambiguous names pause the run and ask “Which did you mean?”." },
  { kind: "tags", stage: "Resolve", request: "GET /v2/tags · feature.semantic_search", purpose: "Matches interests and themes from the brief to exact Qloo tags." },
  { kind: "audiences", stage: "Resolve", request: "GET /v2/audiences", purpose: "Maps audience descriptors in the brief to Qloo audience segments." },
  { kind: "taste", stage: "Audience read · Checks", request: "GET /v2/insights · filter.type=urn:tag · filter.tag.types", purpose: "Taste analysis across lifestyle, aesthetic, tone and other tag types: the raw material for cultural directions. Re-run with each input left out to measure input sensitivity." },
  { kind: "demographics", stage: "Audience read", request: "GET /v2/insights · filter.type=urn:demographics", purpose: "The audience comparison: the aggregate age and gender skew of each reference, beside the audience the brief describes." },
  { kind: "recommend", stage: "Explore", request: "GET /v2/insights · filter.type=urn:entity:* · feature.explainability", purpose: "Cross-domain worlds (artists, podcasts, TV, films, books, brands) for the brief's references, with attribution showing which input drove each result." },
  { kind: "places", stage: "Explore", request: "GET /v2/insights · filter.type=urn:entity:place · filter.location.query", purpose: "Places in each market's city that fit the profile, for local execution ideas only." },
  { kind: "score_tags", stage: "Checks · Casting", request: "GET /v2/insights · filter.type=urn:tag · filter.results.tags", purpose: "Scores a supplied list of tags against a profile: coherence of a direction, relevance to an audience-only profile, and creators' confirmed themes." },
  { kind: "score_entities", stage: "Casting", request: "GET /v2/insights · filter.results.entities", purpose: "Scores every roster creator's confirmed public references against each direction in one query, so ranks are comparable." },
];

const RULES = [
  ["Findings are written by code", "Every Qloo finding is rendered from a stored result by a template: field, value, rank and query. The model chooses which findings matter, never their text or numbers. The database rejects a finding not created by a template."],
  ["Interpretations are labelled and bound", "The model's readings are always labelled Interpretation, must cite at least one finding from this run, and may not contain numbers, superlatives, purchase or performance predictions, or claims about individuals. Output that breaks a rule is sent back with the specific problems, a bounded number of times."],
  ["Scores stay inside their query", "Qloo normalises affinity per request, so scores from different requests are never averaged or compared. Creators are ranked within one query per direction and type, by their best reference, so listing more references never helps. A reference Qloo did not return is “not measured”, never zero."],
  ["Three separate checks", "Coherence (do the references relate), input sensitivity (does the direction survive removing each input, by rank-biased overlap) and campaign relevance (scored against a profile built only from the intended audience) are reported separately, with the inputs tested listed."],
] as const;

const GUARDRAILS = [
  "Only public entity names and tags are sent to Qloo. Creator names and personal data never are.",
  "A creator's own cultural references describe their work and identity; they are never presented as evidence about their followers.",
  "City is used for production logistics and local ideas, never as a cultural-fit signal.",
  "Qloo responses are cached privately in the database and never committed to the repository.",
];

const LIMITATIONS = [
  "When the brief describes the audience only by age, Qloo returns flat affinities for that profile, so campaign relevance is shown as “not measured” rather than a number.",
  "Taste analysis returns nothing when combined with a location signal, so market differences come from place results filtered to each city, with coverage notes where evidence is thin.",
  "Trending data came back flat for the brands we tested, so momentum is not used.",
  "Qloo describes aggregate affinities. Nothing here predicts what an individual will buy or how a video will perform.",
];

export default function AboutQlooPage() {
  return (
    <PublicShell>
      <p className="text-sm font-medium text-primary">How it uses Qloo</p>
      <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Every claim traces back to a stored Qloo result.</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Common Ground uses Qloo&apos;s Taste AI to find the cultural context a brand and a creator share. This page lists each capability the research pipeline uses, the rules that keep claims honest, and one claim from the showcase traced back to the request that produced it.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Capabilities used</h2>
        <Suspense fallback={<Skeleton className="mt-4 h-96 w-full" />}>
          <CapabilityTable />
        </Suspense>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">From request to claim</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">One interpretation from the showcase campaign, followed back to the Qloo request behind it. Loaded live from the stored provenance.</p>
        <Suspense fallback={<Skeleton className="mt-4 h-80 w-full" />}>
          <TracedExample />
        </Suspense>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <h2 className="text-xl font-semibold tracking-tight sm:col-span-2">Claim rules</h2>
        {RULES.map(([title, body]) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Guardrails</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {GUARDRAILS.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Limitations</h2>
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
          The showcase campaign logged {usage.total} Qloo requests ({usage.cached} served from the private cache) and stored {usage.evidenceRows} evidence rows.
        </p>
      )}
      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Request</th>
              <th className="px-4 py-2 font-medium">What it is for</th>
              {usage && <th className="px-4 py-2 text-right font-medium">Showcase calls</th>}
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
  if (!ex) return <p className="mt-4 text-sm text-muted-foreground">The showcase is being prepared. Check back after the next deploy.</p>;
  const label = (id: string) => ex.labels.get(id);
  const shownParams = Object.entries(ex.call.params).filter(([k]) => k !== "take" && k !== "page");

  return (
    <ol className="mt-6 grid gap-4 lg:grid-cols-2">
      <Step n={1} title="Request">
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
        <p className="mt-2 text-xs text-muted-foreground">{ex.call.cached ? "Served from the private cache" : `${ex.call.latencyMs} ms`} · API key and raw response not shown</p>
      </Step>
      <Step n={2} title="Results, as stored">
        <ul className="grid gap-1.5 text-sm">
          {ex.results.map((r) => (
            <li key={r.id} className={`flex items-baseline gap-2 ${r.id === ex.evidenceId ? "font-medium" : "text-muted-foreground"}`}>
              <span className="w-8 shrink-0 tabular-nums text-xs">#{r.rank}</span>
              <span className="flex-1">{r.label}</span>
              <span className="tabular-nums text-xs">affinity {fmt(r.values.affinity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Rank and affinity are comparable only within this one query.</p>
      </Step>
      <Step n={3} title="Finding, written by code">
        <div className="flex items-start gap-2">
          <ClaimBadge kind="finding" />
          <p className="text-sm">{ex.finding}</p>
        </div>
      </Step>
      <Step n={4} title="Interpretation, written by the model">
        <div className="flex items-start gap-2">
          <ClaimBadge kind="interpretation" />
          <p className="text-sm">{ex.interpretation}</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          From the direction “{ex.direction}” in the{" "}
          <a href="/showcase" className="underline underline-offset-2">showcase campaign</a>.
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
