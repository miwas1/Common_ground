import { Badge } from "@/components/ui/badge";
import type { ClaimView } from "@/lib/views/campaign";

const KIND_LABEL: Record<ClaimView["kind"], string> = {
  finding: "Qloo finding",
  interpretation: "Interpretation",
  portfolio: "Portfolio",
  commercial: "Commercial",
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

/** Interpretations first, each followed by the findings it rests on; then any other findings. */
export function ClaimList({ claims, showProvenance = false }: { claims: ClaimView[]; showProvenance?: boolean }) {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const interpretations = claims.filter((c) => c.kind === "interpretation");
  const citedIds = new Set(interpretations.flatMap((i) => i.basedOn));
  const otherFindings = claims.filter((c) => c.kind === "finding" && !citedIds.has(c.id));

  return (
    <div className="space-y-3">
      {interpretations.map((i) => (
        <div key={i.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-start gap-2">
            <ClaimBadge kind="interpretation" />
            <p className="text-sm">{i.text}</p>
          </div>
          <ul className="mt-2 space-y-1.5 border-l-2 border-info/30 pl-3">
            {i.basedOn.map((id) => byId.get(id)).filter(Boolean).map((f) => (
              <FindingLine key={f!.id} finding={f!} showProvenance={showProvenance} />
            ))}
          </ul>
        </div>
      ))}
      {otherFindings.length > 0 && (
        <ul className="space-y-1.5">
          {otherFindings.map((f) => (
            <FindingLine key={f.id} finding={f} showProvenance={showProvenance} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function FindingLine({ finding, showProvenance }: { finding: ClaimView; showProvenance?: boolean }) {
  return (
    <li className="text-xs text-muted-foreground">
      <span className="mr-1.5 font-medium text-info">Qloo</span>
      {finding.text}
      {showProvenance && finding.provenance && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-[11px]">Request details</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
            {`GET ${finding.provenance.endpoint}\n${Object.entries(finding.provenance.params)
              .map(([k, v]) => `  ${k}=${v}`)
              .join("\n")}\n${finding.provenance.cached ? "(served from private cache)" : "(live call)"} · ${finding.provenance.at}`}
          </pre>
        </details>
      )}
    </li>
  );
}
