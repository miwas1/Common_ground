import Link from "next/link";
import { Suspense } from "react";
import { evaluateAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ClaimList } from "@/components/claims";
import { RunPoller } from "@/components/run-poller";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatFee, formatMoney } from "@/lib/pipeline/money";
import { getCampaignHeader } from "@/lib/views/campaign";
import { getEvaluation, type EvaluationVersion } from "@/lib/views/evaluate";

const DIRECTION_BAR = ["bg-direction-1", "bg-direction-2", "bg-direction-3", "bg-direction-4"];

function costRange(cents: number[], currency: string) {
  if (cents.length === 0) return "no option fits the budget";
  const lo = Math.min(...cents);
  const hi = Math.max(...cents);
  return lo === hi ? formatMoney(lo, currency) : `${formatMoney(lo, currency)} – ${formatMoney(hi, currency)}`;
}

function Version({ label, v, reveal, currency, campaignId }: { label: string; v: EvaluationVersion; reveal: boolean; currency: string; campaignId: string }) {
  const proposals = v.directions.flatMap((d) => d.proposals);
  return (
    <section className="grid content-start gap-4" aria-label={label}>
      <div className="grid gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {label}
          {reveal && <Badge variant={v.mode === "qloo" ? "default" : "outline"}>{v.mode === "qloo" ? "With Qloo" : "Without Qloo"}</Badge>}
        </h2>
        <p className="text-sm text-muted-foreground">
          {v.directions.length} directions · {proposals.length} proposals · {v.creatorIds.length} creators · budget options {costRange(v.packageCosts, currency)}
        </p>
        {reveal && (
          <p className="text-sm text-muted-foreground">
            {v.mode === "qloo"
              ? `Based on ${v.qlooFindings} pieces of Qloo data.`
              : "Based only on your brief and the AI's general knowledge."}
          </p>
        )}
      </div>
      {v.directions.map((d, i) => (
        <Card key={d.id} size="sm" className="overflow-hidden">
          <div className={`h-1 ${DIRECTION_BAR[i % 4]}`} aria-hidden />
          <CardHeader>
            <CardTitle>{d.title}</CardTitle>
            <CardDescription>{d.audienceContext}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              <span className="font-medium">Where the product fits:</span> {d.productRole}
            </p>
            {d.artDirection.moodWords?.length ? <p className="text-muted-foreground">Mood: {d.artDirection.moodWords.join(", ")}</p> : null}
            {reveal ? (
              <ClaimList claims={d.claims} />
            ) : (
              <ul className="grid list-disc gap-1 pl-5">
                {d.claims
                  .filter((c) => c.kind === "interpretation")
                  .map((c) => (
                    <li key={c.id}>{c.text}</li>
                  ))}
              </ul>
            )}
            {d.proposals.length > 0 && (
              <div className="grid gap-2 border-t pt-3">
                {d.proposals.map((p) => (
                  <div key={p.id} className="grid gap-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {p.creator} · {p.concept.title}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatFee(p.terms)}</span>
                    </p>
                    <p>{p.concept.logline}</p>
                    <p className="text-muted-foreground">Tests: {p.hypothesis}</p>
                    {reveal && v.mode === "qloo" && (
                      <Link href={`/brand/campaigns/${campaignId}/proposals/${p.id}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                        Open proposal
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

async function Evaluate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reveal?: string }> }) {
  const { id } = await params;
  const { reveal: revealParam } = await searchParams;
  const reveal = revealParam === "1";
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { campaign, revision } = await getCampaignHeader(id);
  const evaluation = await getEvaluation(id);
  const currency = revision?.currency ?? "USD";
  const canRun = !campaign.isShowcase;

  const intro = (
    <p className="max-w-3xl text-sm text-muted-foreground">
      Does Qloo make the result better? We run your brief twice, the same way each time, except one run gets Qloo&apos;s data and the other doesn&apos;t.
      You see them side by side as A and B without knowing which is which. Decide which you prefer, then reveal the answer.
    </p>
  );

  if (evaluation.state === "no_brief" || evaluation.state === "no_research") {
    return (
      <div className="grid gap-4">
        {intro}
        <p className="text-sm">You can run this once the research has finished.</p>
      </div>
    );
  }

  if (evaluation.state === "not_started" || (evaluation.state === "baseline_running" && ["error", "cancelled"].includes(evaluation.status))) {
    const failed = evaluation.state === "baseline_running";
    return (
      <div className="grid gap-4">
        {intro}
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            The run without Qloo stopped: {evaluation.stages.find((s) => s.error)?.error ?? "it was cancelled"}.
          </p>
        )}
        {canRun ? (
          <ActionForm action={evaluateAction.bind(null, id)} className="grid max-w-md gap-3">
            <Button type="submit">{failed ? "Run the comparison again" : "Run the comparison"}</Button>
            <p className="text-xs text-muted-foreground">Runs your brief again without Qloo. Your campaign stays as it is.</p>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">The comparison for this example isn&apos;t ready yet.</p>
        )}
      </div>
    );
  }

  if (evaluation.state === "baseline_running") {
    return (
      <div className="grid gap-4">
        {intro}
        <RunPoller active />
        <Card size="sm" className="max-w-md">
          <CardHeader>
            <CardTitle>Running the brief without Qloo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-1.5 text-sm">
              {evaluation.stages.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3">
                  <span className={s.status === "pending" ? "text-muted-foreground" : ""}>{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.status === "done" ? "Done" : s.status === "running" ? "Running…" : s.status === "error" ? "Retrying" : ""}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { a, b, sharedCreators, creatorsInEither } = evaluation;
  return (
    <div className="grid gap-6">
      {intro}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {sharedCreators} of {creatorsInEither} creators were picked in both.
        </span>
        <Button asChild variant={reveal ? "outline" : "default"} size="sm">
          <Link href={reveal ? `/brand/campaigns/${id}/evaluate` : `/brand/campaigns/${id}/evaluate?reveal=1`} scroll={false}>
            {reveal ? "Hide the answer" : "Show which is which"}
          </Link>
        </Button>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Version label="Result A" v={a} reveal={reveal} currency={currency} campaignId={id} />
        <Version label="Result B" v={b} reveal={reveal} currency={currency} campaignId={id} />
      </div>
    </div>
  );
}

export default function EvaluatePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ reveal?: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Evaluate {...props} />
    </Suspense>
  );
}
