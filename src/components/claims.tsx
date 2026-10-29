import { Badge } from "@/components/ui/badge";
import type { ClaimView, Signal } from "@/lib/views/campaign";

const KIND_LABEL: Record<ClaimView["kind"], string> = {
  finding: "Qloo data",
  interpretation: "Insight",
  portfolio: "Past work",
  commercial: "Price",
};

const KIND_STYLE: Record<ClaimView["kind"], string> = {
  finding: "bg-info-soft text-info",
  interpretation: "bg-accent text-accent-foreground",
  portfolio: "bg-success-soft text-success",
  commercial: "bg-warning-soft text-warning",
};

export function ClaimBadge({ kind }: { kind: ClaimView["kind"] }) {
  return <Badge className={`${KIND_STYLE[kind]} border-0 font-medium`}>{KIND_LABEL[kind]}</Badge>;
}

/**
 * Insights, numbered, each with the Qloo results it rests on shown as compact rows. The exact
 * sentences written from the stored results stay one click away under "Source details".
 */
export function ClaimList({ claims }: { claims: ClaimView[] }) {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const interpretations = claims.filter((c) => c.kind === "interpretation");
  const citedIds = new Set(interpretations.flatMap((i) => i.basedOn));
  const otherFindings = claims.filter((c) => c.kind === "finding" && !citedIds.has(c.id));

  return (
    <div className="grid gap-5">
      {interpretations.length > 0 && (
        <ol className="grid gap-5">
          {interpretations.map((i, n) => {
            const findings = i.basedOn.map((id) => byId.get(id)).filter((f): f is ClaimView => Boolean(f));
            return (
              <li key={i.id} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
                <span className="pt-0.5 font-display text-xl leading-none text-muted-foreground tabular-nums">{String(n + 1).padStart(2, "0")}</span>
                <div className="grid gap-2.5">
                  <p className="text-[15px] leading-relaxed font-medium">{i.text}</p>
                  {findings.length > 0 && <Evidence findings={findings} />}
                  {i.basis.length > 0 && (
                    <ul className="grid gap-1">
                      {i.basis.map((b) => (
                        <li key={b} className="text-xs text-muted-foreground">
                          <span className="mr-1.5 font-semibold tracking-wide text-foreground/70 uppercase">Your brief</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {otherFindings.length > 0 && <Evidence findings={otherFindings} />}
    </div>
  );
}

function Evidence({ findings }: { findings: ClaimView[] }) {
  const signals = findings.filter((f) => f.signal);
  const sentences = findings.filter((f) => !f.signal);
  return (
    <div className="grid gap-1.5">
      {signals.length > 0 && (
        <ul className="@container divide-y overflow-hidden rounded-lg border bg-background">
          {signals.map((f) => (
            <SignalRow key={f.id} signal={f.signal!} />
          ))}
        </ul>
      )}
      {sentences.length > 0 && (
        <ul className="grid gap-1">
          {sentences.map((f) => (
            <FindingLine key={f.id} finding={f} />
          ))}
        </ul>
      )}
      {signals.length > 0 && (
        <details className="group text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer list-none hover:text-foreground">
            <span className="group-open:hidden">Source details</span>
            <span className="hidden group-open:inline">Hide source details</span>
          </summary>
          <ul className="mt-1.5 grid gap-1 border-l-2 border-info/30 pl-3">
            {signals.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SignalRow({ signal: s }: { signal: Signal }) {
  const where = s.rank && s.of ? `#${s.rank} of ${s.of}` : null;
  return (
    // Narrow lists (phones, sidebars): name and affinity on one line, rank underneath. Wide: one line.
    <li className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm @lg:grid-cols-[2.5rem_1fr_auto_auto] @lg:gap-x-3">
      <span className="text-[10px] font-semibold tracking-wider text-info uppercase">Qloo</span>
      <span className="min-w-0 font-medium break-words">{s.label}</span>
      <span className="col-start-2 col-end-4 row-start-2 text-xs text-muted-foreground tabular-nums @lg:col-start-3 @lg:col-end-4 @lg:row-start-1 @lg:text-right">
        {where}
        {where && s.category ? " " : ""}
        {s.category}
      </span>
      {s.affinity !== null && (
        <span className="col-start-3 row-start-1 @lg:col-start-4">
          <AffinityMeter value={s.affinity} />
        </span>
      )}
    </li>
  );
}

/** Affinity as a plain number: it only compares within one Qloo query, so a bar would overstate it. */
function AffinityMeter({ value }: { value: number }) {
  return (
    <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info tabular-nums" title="Affinity. Compare only with results from the same query.">
      {value.toFixed(2)}
    </span>
  );
}

export function FindingLine({ finding }: { finding: ClaimView }) {
  return (
    <li className="text-xs text-muted-foreground">
      <span className="mr-1.5 font-semibold tracking-wider text-info uppercase">Qloo</span>
      {finding.text}
    </li>
  );
}
