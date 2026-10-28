import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatMoney } from "@/lib/pipeline/money";
import { compareRevisions, listRevisions, type RevisionSummary } from "@/lib/views/revisions";

const DIRECTION_DOT = ["bg-direction-1", "bg-direction-2", "bg-direction-3", "bg-direction-4"];
const PACKAGE: Record<string, string> = { concentrated: "Concentrated", broad_test: "Broad test", production_heavy: "Production-heavy", hybrid: "Hybrid" };
const RUN_STATUS: Record<string, string> = { done: "Researched", running: "Researching", pending: "Queued", needs_input: "Waiting for your choice", error: "Stopped", cancelled: "Cancelled" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ rev?: string }> };

async function Revisions({ params, searchParams }: Props) {
  const { id } = await params;
  const { rev } = await searchParams;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const [history, cmp] = await Promise.all([listRevisions(id), compareRevisions(id, rev)]);
  const currency = history[0]?.revision.currency ?? "USD";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div className="grid content-start gap-6">
        {!cmp ? (
          <p className="text-sm text-muted-foreground">This revision has nothing earlier to compare with.</p>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold">
                Revision {cmp.after.revision.number} compared with revision {cmp.before.revision.number}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{cmp.after.revision.changeNote}. Everything below was researched again from the start; nothing was carried over except your inputs and choices.</p>
            </div>

            {!cmp.after.done ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Revision {cmp.after.revision.number} is still being researched. The comparison appears when it finishes.</p>
            ) : (
              <>
                <InputsChanged cmp={cmp} currency={currency} />
                <section className="grid gap-3">
                  <h3 className="font-semibold">Directions</h3>
                  <p className="text-sm text-muted-foreground">Matched by the Qloo results each direction rests on, not by title.</p>
                  {cmp.pairs.map((p) => (
                    <Card key={p.after.id} size="sm">
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <Dot d={p.before} /> <span className="text-muted-foreground">{p.before.title}</span>
                          <span aria-hidden>→</span>
                          <Dot d={p.after} /> {p.after.title}
                        </CardTitle>
                        <CardDescription>
                          Shares {p.shared.length} of its anchor findings with the earlier direction.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                        <Names label="No longer cited" names={p.lost} tone="removed" empty="Nothing dropped" />
                        <Names label="Newly cited" names={p.gained} tone="added" empty="Nothing new" />
                        <Names label="Creators who left the shortlist" names={p.creators.removed} tone="removed" empty="None" />
                        <Names label="Creators who joined the shortlist" names={p.creators.added} tone="added" empty="None" />
                      </CardContent>
                    </Card>
                  ))}
                  {cmp.dropped.map((d) => (
                    <DirectionOnly key={d.id} d={d} note={`Only in revision ${cmp.before.revision.number}: no direction in the new revision rests on the same results.`} muted />
                  ))}
                  {cmp.added.map((d) => (
                    <DirectionOnly key={d.id} d={d} note={`New in revision ${cmp.after.revision.number}.`} />
                  ))}
                </section>
                {cmp.packages.length > 0 && (
                  <section>
                    <h3 className="font-semibold">Budget packages</h3>
                    <table className="mt-3 w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1 font-medium">Package</th>
                          <th className="py-1 text-right font-medium">Revision {cmp.before.revision.number}</th>
                          <th className="py-1 text-right font-medium">Revision {cmp.after.revision.number}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {cmp.packages.map((p) => (
                          <tr key={p.kind}>
                            <td className="py-1.5">{PACKAGE[p.kind] ?? p.kind}</td>
                            <td className="py-1.5 text-right tabular-nums">{p.before === null ? "—" : formatMoney(p.before, currency)}</td>
                            <td className="py-1.5 text-right tabular-nums">{p.after === null ? "—" : formatMoney(p.after, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      <aside>
        <h3 className="text-sm font-semibold">History</h3>
        <ol className="mt-3 grid gap-2 text-sm">
          {history.map(({ revision: r, run }) => (
            <li key={r.id} className="rounded-lg border p-3">
              <p className="flex items-center gap-2 font-medium">
                Revision {r.number}
                {run && <Badge variant="outline">{RUN_STATUS[run.status] ?? run.status}</Badge>}
              </p>
              <p className="mt-1 text-muted-foreground">{r.changeNote ?? "First brief"}</p>
              {r.parentRevisionId && (
                <Link href={`/brand/campaigns/${id}/revisions?rev=${r.id}`} className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
                  Compare with revision {r.number - 1}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function InputsChanged({ cmp, currency }: { cmp: NonNullable<Awaited<ReturnType<typeof compareRevisions>>>; currency: string }) {
  const b0 = cmp.before.revision.budgetCents;
  const b1 = cmp.after.revision.budgetCents;
  return (
    <section className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
      <Names label="References removed" names={cmp.references.removed} tone="removed" empty="None" />
      <Names label="Audience statements removed" names={cmp.inputs.removed} tone="removed" empty="None" />
      <div>
        <p className="text-xs font-medium text-muted-foreground">Budget</p>
        <p>{b0 === b1 ? "Unchanged" : `${b0 ? formatMoney(b0, currency) : "None"} → ${b1 ? formatMoney(b1, currency) : "None"}`}</p>
      </div>
    </section>
  );
}

function Names({ label, names, tone, empty }: { label: string; names: string[]; tone: "added" | "removed"; empty: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {names.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <li key={n} className={`rounded px-1.5 py-0.5 text-xs ${tone === "added" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground line-through"}`}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dot({ d }: { d: RevisionSummary["directions"][number] }) {
  return <span className={`inline-block size-2.5 rounded-full ${DIRECTION_DOT[(d.colorIndex - 1) % 4]}`} aria-hidden />;
}

function DirectionOnly({ d, note, muted }: { d: RevisionSummary["directions"][number]; note: string; muted?: boolean }) {
  return (
    <Card size="sm" className={muted ? "opacity-70" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Dot d={d} /> {d.title}
        </CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      {d.creators.length > 0 && (
        <CardContent className="text-sm text-muted-foreground">Shortlist: {d.creators.join(", ")}</CardContent>
      )}
    </Card>
  );
}

export default function RevisionsPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Revisions {...props} />
    </Suspense>
  );
}
