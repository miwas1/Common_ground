import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { QLOO_NOTE, unquote } from "@/lib/briefs/markdown";
import { formatFee } from "@/lib/pipeline/money";
import { getProposalBrief } from "@/lib/views/brief";

export const metadata: Metadata = { title: "Proposal brief · Common Ground" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 break-inside-avoid">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-primary print:text-black">{title}</h2>
      {children}
    </section>
  );
}

async function Brief({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const doc = await getProposalBrief(id, pid);
  if (!doc) notFound();
  const hasFindings = doc.why.some((w) => w.findings.length);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/brand/campaigns/${id}/proposals/${pid}`} className="mr-auto text-sm text-muted-foreground hover:text-foreground">
          ← Back to the proposal
        </Link>
        <Button asChild variant="outline">
          <a href={`/brand/briefs/${id}/${pid}/brief.md`} download>
            Download Markdown
          </a>
        </Button>
        <PrintButton />
      </div>

      <article className="grid gap-7 text-sm leading-relaxed">
        <header className="grid gap-2 border-b pb-6">
          <p className="text-xs text-muted-foreground">
            {doc.brand} · {doc.campaign} · {doc.markets.join(", ")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{doc.concept.title}</h1>
          <p className="text-base">
            {doc.creator.name}, {doc.creator.city} × {doc.brand} · {doc.product.name}
          </p>
          <p className="text-base italic text-muted-foreground">{doc.concept.logline}</p>
        </header>

        <Section title="The brief">
          <p><span className="font-medium">Goal:</span> {doc.objective}</p>
          <p><span className="font-medium">Product:</span> {doc.product.name}{doc.product.description ? ` — ${doc.product.description}` : ""}</p>
        </Section>

        <Section title={`Creative direction: ${doc.direction.title}`}>
          <p>{doc.direction.audienceContext}</p>
          <p><span className="font-medium">Where the product fits:</span> {doc.direction.productRole}</p>
          {(doc.direction.palette || doc.direction.settings.length > 0 || doc.direction.moodWords.length > 0) && (
            <p className="text-muted-foreground">
              {[
                doc.direction.palette && `Palette: ${doc.direction.palette}`,
                doc.direction.settings.length > 0 && `Settings: ${doc.direction.settings.join(", ")}`,
                doc.direction.moodWords.length > 0 && `Mood: ${doc.direction.moodWords.join(", ")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </Section>

        <Section title="Concept">
          <p><span className="font-medium">Opening line:</span> “{unquote(doc.concept.hook)}”</p>
          <ol className="grid list-decimal gap-1 pl-5">
            {doc.concept.beats.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
          <p><span className="font-medium">How the product appears:</span> {doc.concept.productIntegration}</p>
          <p><span className="font-medium">Setting:</span> {doc.concept.setting}</p>
        </Section>

        <div className="grid gap-7 sm:grid-cols-2">
          <Section title="What gets made">
            <ul className="grid gap-1">
              {doc.deliverables.map((d, i) => (
                <li key={i}>{d.count} × {d.format}{d.notes ? ` — ${d.notes}` : ""}</li>
              ))}
            </ul>
          </Section>
          <Section title="Price">
            <p><span className="font-medium">{formatFee(doc.terms)}</span>{doc.terms.amountCents !== null ? <> for “{doc.terms.package}”</> : null}</p>
            <p>Usage: {doc.terms.usageTerms}</p>
            {doc.terms.validUntil && <p>Quote valid until {doc.terms.validUntil.slice(0, 10)}</p>}
          </Section>
        </div>

        <Section title="What this tests">
          <p>{doc.hypothesis}</p>
        </Section>

        {doc.why.length > 0 && (
          <Section title="Why this collaboration">
            <ul className="grid gap-3">
              {doc.why.map((w, i) => (
                <li key={i}>
                  <p>{w.text}</p>
                  {w.findings.length > 0 && (
                    <ul className="mt-1 grid gap-1 border-l-2 border-info/30 pl-3 text-xs text-muted-foreground">
                      {w.findings.map((f) => (
                        <li key={f}><span className="mr-1.5 font-medium text-info print:text-black">Qloo</span>{f}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {doc.relevantWork.length > 0 && (
          <Section title={`${doc.creator.name}'s relevant work`}>
            <ul className="grid list-disc gap-1 pl-5">
              {doc.relevantWork.map((w, i) => (
                <li key={i}>
                  {w.text}
                  {w.titles.length > 0 && <span className="text-muted-foreground"> ({w.titles.map((t) => `“${t}”`).join(", ")})</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {doc.openQuestions.length > 0 && (
          <Section title="Still to agree">
            <ul className="grid list-disc gap-1 pl-5">
              {doc.openQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </Section>
        )}

        <footer className="grid gap-1 border-t pt-4 text-xs text-muted-foreground">
          <p>Prepared with Common Ground on {doc.generatedAt.slice(0, 10)}.</p>
          {hasFindings && <p>{QLOO_NOTE}</p>}
          {doc.creator.isDemo && <p>This is a made-up demo creator.</p>}
        </footer>
      </article>
    </>
  );
}

export default function BriefPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 bg-background px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Brief params={params} />
      </Suspense>
    </main>
  );
}
