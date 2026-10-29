import { cancelRun, retryResearchAction, submitResolution } from "@/app/actions";
import { RunPoller } from "@/components/run-poller";
import { RunProgress } from "@/components/run-progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UnderstandOutput } from "@/lib/pipeline/stages/understand";
import type { Candidate } from "@/lib/qloo/resolve";
import { getRunProgress } from "@/lib/views/campaign";

const TYPE_LABEL: Record<string, string> = {
  "urn:entity:brand": "brand",
  "urn:entity:artist": "artist",
  "urn:entity:tv_show": "TV show",
  "urn:entity:movie": "film",
  "urn:entity:podcast": "podcast",
  "urn:entity:book": "book",
};

export async function RunPanel({ runId, campaignId }: { runId: string; campaignId: string }) {
  const { run, stages, needsChoice, references, understanding, lookup } = await getRunProgress(runId);
  const active = run.status === "pending" || run.status === "running";
  const failed = stages.find((s) => s.status === "error");

  if (run.status === "done") {
    const rejected = references.filter((r) => r.status === "rejected");
    const notFound = rejected.filter((r) => (r.candidates as Candidate[]).length === 0);
    const leftOut = rejected.filter((r) => (r.candidates as Candidate[]).length > 0);
    if (rejected.length === 0 && !lookup?.matched?.length && !understanding) return null;
    return (
      <div className="grid gap-2">
        {understanding && (
          <details className="group rounded-lg border-l-2 border-info bg-info-soft px-3 py-2.5 text-sm">
            <summary className="cursor-pointer list-none text-[11px] font-semibold tracking-wide text-info uppercase">
              What we understood about your brief <span className="font-normal normal-case group-open:hidden">· show</span>
            </summary>
            <div className="mt-2">
              <Understood understanding={understanding} full />
            </div>
          </details>
        )}
        {(rejected.length > 0 || lookup?.matched?.length) && (
          <p className="text-xs text-muted-foreground">
            {lookup?.matched?.length ? <>We read {lookup.matched.map((m) => `“${m.from}” as ${m.to}`).join(", ")}. </> : null}
            {notFound.length > 0 && <>No good match for: {notFound.map((r) => r.label).join(", ")}. </>}
            {leftOut.length > 0 && <>You left out: {leftOut.map((r) => r.label).join(", ")}.</>}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card size="sm">
      <RunPoller active={active} />
      <CardHeader>
        <CardTitle>{run.status === "needs_input" ? "Which did you mean?" : run.status === "error" ? "The research stopped" : run.status === "cancelled" ? "Research cancelled" : "Researching"}</CardTitle>
        <CardDescription>
          {run.status === "needs_input"
            ? "A few names could mean more than one thing, and your brief doesn't say which. Pick the one you meant."
            : active
              ? "You can leave this page. The research keeps going and will be here when you come back."
              : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <RunProgress stages={stages} runStatus={run.status} />

        {understanding && (
          <div className="grid gap-1 rounded-lg border-l-2 border-info bg-info-soft px-3 py-2.5 text-sm">
            <p className="text-[11px] font-semibold tracking-wide text-info uppercase">What we understood</p>
            <Understood understanding={understanding} />
          </div>
        )}

        {lookup?.matched?.length ? (
          <p className="text-xs text-muted-foreground">
            Matched from your brief: {lookup.matched.map((m) => `“${m.from}” → ${m.to}`).join(", ")}
            {lookup.dropped?.length ? `. No good match for ${lookup.dropped.map((d) => `“${d}”`).join(", ")}, so we left it out` : ""}.
          </p>
        ) : null}

        {failed?.error && (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong while {failed.name.charAt(0).toLowerCase() + failed.name.slice(1)}</AlertTitle>
            <AlertDescription>{failed.error}</AlertDescription>
          </Alert>
        )}

        {run.status === "needs_input" && (
          <form action={submitResolution.bind(null, run.id)} className="grid gap-4">
            {needsChoice.map((ref) => (
              <fieldset key={ref.id} className="grid gap-1.5">
                <legend className="text-sm font-medium">
                  “{ref.label}” {ref.qlooType && TYPE_LABEL[ref.qlooType] ? `(${TYPE_LABEL[ref.qlooType]})` : ""}
                </legend>
                {(ref.candidates as Candidate[]).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={`ref_${ref.id}`} value={c.id} required />
                    <span>
                      {c.name}
                      {c.disambiguation && c.disambiguation !== c.name ? <span className="text-muted-foreground"> · {c.disambiguation}</span> : null}
                                          </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="radio" name={`ref_${ref.id}`} value="none" /> None of these, leave it out
                </label>
              </fieldset>
            ))}
            <Button type="submit" className="justify-self-start">Continue research</Button>
          </form>
        )}

        {(run.status === "error" || run.status === "cancelled") && (
          <form action={retryResearchAction.bind(null, campaignId)}>
            <Button type="submit" size="sm">Try again</Button>
          </form>
        )}

        {active && (
          <form action={cancelRun.bind(null, run.id)}>
            <Button type="submit" variant="ghost" size="sm">Cancel research</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** The "Understanding your brief" step's reading; `full` adds terms, peers and cautions. */
function Understood({ understanding, full = false }: { understanding: UnderstandOutput; full?: boolean }) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <ul className="mt-0.5 list-disc pl-5">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="grid gap-2">
      <p>{understanding.summary}</p>
      {full && list("Terms in your brief", understanding.terms.map((t) => `${t.term}: ${t.meaning}`))}
      {full && list("Similar brands", understanding.peers)}
      {full && list("Things to be careful about", understanding.cautions)}
      {understanding.sources.length > 0 && (
        <p className="text-xs text-muted-foreground">
          From a web search:{" "}
          {understanding.sources.slice(0, full ? 8 : 4).map((src, i) => (
            <span key={src.url}>
              {i > 0 && ", "}
              <a href={src.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-foreground">
                {hostname(src.url)}
              </a>
            </span>
          ))}
          . Background only; the research itself comes from Qloo.
        </p>
      )}
    </div>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
