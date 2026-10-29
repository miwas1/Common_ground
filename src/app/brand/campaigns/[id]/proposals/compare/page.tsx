import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAuthorize } from "@/lib/auth/page";
import { formatFee } from "@/lib/pipeline/money";
import type { BandResult, Capability } from "@/lib/pipeline/stages/cast";
import { getCampaignHeader, getProposals } from "@/lib/views/campaign";
import { BAND_LABEL, CAPABILITY_LABEL } from "@/lib/views/labels";

type Concept = { title: string; logline: string; hook: string; beats: string[]; productIntegration: string; setting: string; openQuestions?: string[] };

async function Compare({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ids?: string | string[] }> }) {
  const { id } = await params;
  const { ids } = await searchParams;
  await pageAuthorize({ type: "campaign.read", campaignId: id });
  const { run } = await getCampaignHeader(id);
  const wanted = (Array.isArray(ids) ? ids : ids ? ids.split(",") : []).slice(0, 3);
  const all = run ? await getProposals(run.id, { includeSetAside: true }) : [];
  const items = wanted.map((w) => all.find((p) => p.proposal.id === w)).filter((x): x is (typeof all)[number] => Boolean(x));
  if (items.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Pick two or three proposals to compare. <Link href={`/brand/campaigns/${id}/proposals`} className="underline underline-offset-2">Back to proposals</Link>
      </p>
    );
  }

  const rows: { label: string; cell: (x: (typeof items)[number]) => React.ReactNode }[] = [
    { label: "Opening line", cell: (x) => `“${(x.version.concept as Concept).hook}”` },
    { label: "The idea", cell: (x) => (x.version.concept as Concept).logline },
    {
      label: "Story",
      cell: (x) => (
        <ol className="list-decimal pl-4">
          {(x.version.concept as Concept).beats.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ol>
      ),
    },
    { label: "How the product appears", cell: (x) => (x.version.concept as Concept).productIntegration },
    {
      label: "What gets made",
      cell: (x) => (x.version.deliverables as { format: string; count: number }[]).map((d) => `${d.count} × ${d.format}`).join(", "),
    },
    {
      label: "Price",
      cell: (x) => {
        const t = x.version.terms as { amountCents: number | null; currency: string; package: string; usageTerms: string };
        return t.amountCents === null ? <span className="font-medium">Quote required</span> : <><span className="font-medium">{formatFee(t)}</span> · {t.package} · {t.usageTerms}</>;
      },
    },
    { label: "Relevant past work", cell: (x) => CAPABILITY_LABEL[(x.fit?.capability as Capability | undefined)?.level ?? "not assessed"] },
    {
      label: "Culture fit",
      cell: (x) => {
        const bands = Object.entries((x.fit?.culturalBands ?? {}) as Record<string, BandResult>);
        return bands.length ? bands.map(([k, b]) => `${k === "audience" ? "Qloo audience" : k} ${(BAND_LABEL[b.band] ?? b.band).toLowerCase()}`).join(" · ") : "No data";
      },
    },
    { label: "What this tests", cell: (x) => x.version.hypothesis },
    {
      label: "Still to agree",
      cell: (x) => {
        const open = (x.version.concept as Concept).openQuestions ?? [];
        return open.length ? (
          <ul className="list-disc pl-4">
            {open.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        ) : (
          "Nothing listed"
        );
      },
    },
    { label: "Version", cell: (x) => `v${x.version.number}${x.version.authorRole === "brand" ? " · edited by your team" : ""}${x.proposal.status === "set_aside" ? " · set aside" : ""}` },
  ];

  return (
    <div className="grid gap-4">
      <Link href={`/brand/campaigns/${id}/proposals`} className="text-sm text-muted-foreground hover:text-foreground">← All proposals</Link>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b align-bottom">
              <th className="w-36 p-4" />
              {items.map((x) => (
                <th key={x.proposal.id} className="p-4 text-left font-normal">
                  <span className="block h-1 w-10 rounded-full" style={{ background: `var(--direction-${((x.direction.colorIndex - 1) % 4) + 1})` }} aria-hidden />
                  <span className="mt-2 block text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{x.direction.title}</span>
                  <Link href={`/brand/campaigns/${id}/proposals/${x.proposal.id}`} className="mt-1 block font-display text-xl leading-tight hover:underline">
                    {(x.version.concept as Concept).title}
                  </Link>
                  <span className="mt-1 block text-muted-foreground">{x.creator.displayName}{x.creator.city ? ` · ${x.creator.city}` : ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b align-top last:border-0">
                <th scope="row" className="p-4 text-left text-xs font-medium text-muted-foreground">{r.label}</th>
                {items.map((x) => (
                  <td key={x.proposal.id} className="p-4 leading-relaxed">{r.cell(x)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ids?: string | string[] }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Compare params={params} searchParams={searchParams} />
    </Suspense>
  );
}
