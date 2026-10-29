"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/brand", label: "Campaigns", match: (p: string) => p === "/brand" || (p.startsWith("/brand/campaigns/") && !p.endsWith("/new")) },
  { href: "/brand/campaigns/new", label: "New campaign", match: (p: string) => p === "/brand/campaigns/new" },
  { href: "/brand/creators", label: "Creators", match: (p: string) => p.startsWith("/brand/creators") },
  { href: "/brand/profile", label: "Brand profile", match: (p: string) => p.startsWith("/brand/profile") },
  { href: "/about/qloo", label: "How we use Qloo", match: (p: string) => p.startsWith("/about") },
];

/** Signed-in navigation; the current section is marked. Without a path (prerendering) nothing is marked. */
export function AppNav({ pathname: given }: { pathname?: string } = {}) {
  return <NavLinks pathname={given ?? ""} />;
}

export function CurrentAppNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 transition ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
