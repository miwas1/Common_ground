"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function CampaignTabs({ campaignId, counts }: { campaignId: string; counts: { proposals: number; revisions: number } }) {
  const pathname = usePathname();
  const base = `/brand/campaigns/${campaignId}`;
  const tabs = [
    { href: base, label: "Strategy" },
    { href: `${base}/proposals`, label: `Proposals${counts.proposals ? ` ${counts.proposals}` : ""}` },
    { href: `${base}/plan`, label: "Plan" },
    ...(counts.revisions > 1 ? [{ href: `${base}/revisions`, label: `Revisions ${counts.revisions}` }] : []),
  ];
  const active = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));
  return (
    <nav className="flex gap-6 border-b text-sm" aria-label="Campaign sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={`-mb-px border-b-2 pb-2 ${active(t.href) ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
