import { eq } from "drizzle-orm";
import { Check, FileText, Quote, Trash2, X } from "lucide-react";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { actingBrandOrg } from "@/lib/auth/brand";
import { pageActor } from "@/lib/auth/page";
import { FACT_KIND_LABEL, FACT_KINDS, type FactKind } from "@/lib/brand/extract";
import { getProfile } from "@/lib/brand/profile";
import { addFactAction, approveAllAction, decideFactAction, removeDocumentAction, removeFactAction, uploadDocumentAction } from "./actions";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const KIND_TONE: Partial<Record<FactKind, string>> = {
  research: "bg-info-soft text-info",
  belief: "bg-warning-soft text-warning",
  measured: "bg-success-soft text-success",
  avoid: "bg-destructive/10 text-destructive",
};

type Params = { document?: string; found?: string; dropped?: string; truncated?: string };

async function Profile({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await pageActor();
  const org = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  if (!org) return <p className="text-sm text-muted-foreground">Your account needs a brand workspace first.</p>;
  const db = await getDb();
  const [params, { documents, facts }, [o]] = await Promise.all([searchParams, getProfile(db, org), db.select({ name: organization.name }).from(organization).where(eq(organization.id, org))]);
  const docName = new Map(documents.map((d) => [d.id, d.name]));
  const suggested = facts.filter((f) => f.status === "suggested");
  const approved = facts.filter((f) => f.status === "approved");

  return (
    <div className="grid gap-10">
      <header>
        {o?.name && <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{o.name}</p>}
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Brand profile</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          What you know about your customers and your brand, kept for every campaign. Each statement shows where it came from, and only the ones you approve are used.
        </p>
      </header>

      <section className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["From customer research", "What customers said or did: interviews, surveys, reviews.", "text-info"],
          ["What your team believes", "Your hunches. Useful, but tested before they're trusted.", "text-warning"],
          ["Measured in past campaigns", "What your content actually did.", "text-success"],
          ["What Qloo suggests", "Lives in each campaign's directions, never mixed in here.", "text-primary"],
        ].map(([title, body, tone]) => (
          <div key={title} className="bg-card p-5">
            <p className={`text-sm font-medium ${tone}`}>{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      {params.document && (
        <p role="status" className="rounded-xl border border-success/25 bg-success-soft/60 px-4 py-3 text-sm">
          Found {params.found ?? 0} statements to review{Number(params.dropped) > 0 ? `. ${params.dropped} more were left out because their quote couldn't be found word for word in the document` : ""}.
          {params.truncated ? " The document was long, so only its first part was read." : ""}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="font-display text-2xl">Add a document</h2>
          <p className="mt-1 text-sm text-muted-foreground">Customer research, brand guidelines or campaign results, as a PDF or text file (up to 4 MB), or paste the text.</p>
          <ActionForm action={uploadDocumentAction} className="mt-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g. Customer interviews, spring" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="text">Or paste the text</Label>
              <Textarea id="text" name="text" rows={5} placeholder="Interview notes, a results summary, your tone of voice…" />
            </div>
            <PendingButton pendingLabel="Reading the document…" className="justify-self-start">
              <FileText className="size-4" /> Read document
            </PendingButton>
          </ActionForm>
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <h2 className="font-display text-2xl">Add a statement</h2>
          <p className="mt-1 text-sm text-muted-foreground">Something you know that isn&apos;t written down anywhere yet. It&apos;s saved as added by you.</p>
          <ActionForm action={addFactAction} className="mt-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="kind">Kind</Label>
              <select id="kind" name="kind" defaultValue="belief" className={SELECT}>
                {FACT_KINDS.map((k) => (
                  <option key={k} value={k}>{FACT_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="statement">Statement</Label>
              <Textarea id="statement" name="text" rows={3} placeholder="e.g. Our customers care more about speed than ritual" />
            </div>
            <Button type="submit" className="justify-self-start">Add statement</Button>
          </ActionForm>
          {documents.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Documents</p>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <FileText className="mr-1.5 inline size-3.5 text-muted-foreground" />
                      {d.name}
                      {d.pages ? <span className="text-muted-foreground"> · {d.pages} pages</span> : null}
                    </span>
                    <form action={removeDocumentAction.bind(null, d.id)}>
                      <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground">
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Remove {d.name} and its statements</span>
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {suggested.length > 0 && (
        <section id="review" className="scroll-mt-20 grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">To review</h2>
              <p className="mt-1 text-sm text-muted-foreground">Read from your documents. Check each one against its passage, fix its kind if needed, then approve it.</p>
            </div>
          </div>
          {[...new Set(suggested.map((f) => f.documentId))].map((docId) => (
            <div key={docId ?? "none"} className="grid gap-3 rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  <FileText className="mr-1.5 inline size-4 text-muted-foreground" />
                  {docId ? docName.get(docId) : "Statements"}
                </p>
                {docId && (
                  <form action={approveAllAction.bind(null, docId)}>
                    <Button type="submit" size="sm" variant="outline">
                      <Check className="size-3.5" /> Approve all from this document
                    </Button>
                  </form>
                )}
              </div>
              <ul className="grid gap-3">
                {suggested
                  .filter((f) => f.documentId === docId)
                  .map((f) => (
                    <li key={f.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div>
                        <p className="text-[15px] leading-relaxed font-medium">{f.text}</p>
                        {f.quote && (
                          <blockquote className="mt-2 border-l-2 border-info/40 pl-3 text-sm text-muted-foreground">
                            <Quote className="mr-1 inline size-3.5" />
                            {f.quote}
                            {f.page ? <span className="ml-1 text-xs">(p. {f.page})</span> : null}
                          </blockquote>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={decideFactAction.bind(null, f.id, "approved")} className="flex items-center gap-2">
                          <select name="kind" defaultValue={f.kind} className={`${SELECT} h-8 w-52`} aria-label="Kind">
                            {FACT_KINDS.map((k) => (
                              <option key={k} value={k}>{FACT_KIND_LABEL[k]}</option>
                            ))}
                          </select>
                          <Button type="submit" size="sm">
                            <Check className="size-3.5" /> Approve
                          </Button>
                        </form>
                        <form action={decideFactAction.bind(null, f.id, "rejected")}>
                          <Button type="submit" size="sm" variant="ghost">
                            <X className="size-3.5" /> Reject
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="grid gap-4">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your profile</h2>
        {approved.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-sm">
            <p className="font-display text-2xl">Nothing approved yet</p>
            <p className="max-w-lg text-muted-foreground">Add a document or a statement. Approved statements prefill new briefs and are checked against every campaign&apos;s directions.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {FACT_KINDS.filter((k) => approved.some((f) => f.kind === k)).map((k) => (
              <div key={k} className="rounded-2xl border bg-card p-5">
                <p className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${KIND_TONE[k] ?? "bg-muted text-foreground"}`}>{FACT_KIND_LABEL[k]}</p>
                <ul className="mt-3 grid gap-3">
                  {approved
                    .filter((f) => f.kind === k)
                    .map((f) => (
                      <li key={f.id} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                        <div>
                          <p>{f.text}</p>
                          {f.quote ? (
                            <details className="mt-1 text-xs text-muted-foreground">
                              <summary className="cursor-pointer">
                                {f.documentId ? docName.get(f.documentId) : "Document"}
                                {f.page ? `, p. ${f.page}` : ""}
                              </summary>
                              <blockquote className="mt-1 border-l-2 border-info/40 pl-2">“{f.quote}”</blockquote>
                            </details>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">Added by your team</p>
                          )}
                        </div>
                        <form action={removeFactAction.bind(null, f.id)}>
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground">
                            <Trash2 className="size-3.5" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </form>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ProfilePage({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Profile searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}
