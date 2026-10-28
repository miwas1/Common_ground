import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/brand" className="font-semibold">
            Common Ground
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/brand" className="hover:text-foreground">Campaigns</Link>
            <Link href="/brand/campaigns/new" className="hover:text-foreground">New campaign</Link>
            <Link href="/about/qloo" className="hover:text-foreground">How it uses Qloo</Link>
          </nav>
          <form action={signOut} className="ml-auto">
            <Button variant="ghost" size="sm" type="submit">Sign out</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
