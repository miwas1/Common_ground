import { cancelRun, retryResearchAction, submitResolution } from "@/app/actions";
import { RunPoller } from "@/components/run-poller";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Candidate } from "@/lib/qloo/resolve";
import { getRunProgress } from "@/lib/views/campaign";

const DOT: Record<string, string> = {
  done: "bg-success",
  running: "bg-primary animate-pulse",
  needs_input: "bg-warning",
  error: "bg-destructive",
  cancelled: "bg-muted-foreground",
  pending: "bg-border",
};

const TYPE_LABEL: Record<string, string> = {
  "urn:entity:brand": "brand",
  "urn:entity:artist": "artist",
  "urn:entity:tv_show": "TV show",
  "urn:entity:movie": "film",
  "urn:entity:podcast": "podcast",
  "urn:entity:book": "book",
};

export async function RunPanel({ runId, campaignId }: { runId: string; campaignId: string }) {
  const { run, stages, needsChoice, references } = await getRunProgress(runId);
  const active = run.status === "pending" || run.status === "running";
  const failed = stages.find((s) => s.status === "error");

  if (run.status === "done") {
    const rejected = references.filter((r) => r.status === "rejected");
    const notFound = rejected.filter((r) => (r.candidates as Candidate[]).length === 0);
    const leftOut = rejected.filter((r) => (r.candidates as Candidate[]).length > 0);
    if (rejected.length === 0) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {notFound.length > 0 && <>Not found in Qloo: {notFound.map((r) => r.label).join(", ")}. </>}
        {leftOut.length > 0 && <>Left out at your choice: {leftOut.map((r) => r.label).join(", ")}.</>}
      </p>
    );
  }

  return (
    <Card size="sm">
      <RunPoller active={active} />
      <CardHeader>
        <CardTitle>{run.status === "needs_input" ? "Which did you mean?" : run.status === "error" ? "Research stopped" : run.status === "cancelled" ? "Research cancelled" : "Researching"}</CardTitle>
        <CardDescription>
          {run.status === "needs_input"
            ? "Some names match more than one thing in Qloo. Choose the right one so the research uses what your customers actually mean."
            : active
              ? "You can leave this page; the research keeps going."
              : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid gap-1.5 text-sm sm:grid-cols-3">
          {stages.map((s) => (
            <li key={s.position} className="flex items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${DOT[s.status] ?? DOT.pending}`} aria-hidden />
              <span className={s.status === "pending" ? "text-muted-foreground" : ""}>{s.name}</span>
              <span className="sr-only">({s.status})</span>
            </li>
          ))}
        </ol>

        {failed?.error && (
          <Alert variant="destructive">
            <AlertTitle>{failed.name} failed</AlertTitle>
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
                      {c.popularity !== undefined ? <span className="text-muted-foreground"> · popularity {c.popularity.toFixed(2)}</span> : null}
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="radio" name={`ref_${ref.id}`} value="none" /> None of these: leave it out
                </label>
              </fieldset>
            ))}
            <Button type="submit" className="justify-self-start">Continue research</Button>
          </form>
        )}

        {(run.status === "error" || run.status === "cancelled") && (
          <form action={retryResearchAction.bind(null, campaignId)}>
            <Button type="submit" size="sm">Run the research again</Button>
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
