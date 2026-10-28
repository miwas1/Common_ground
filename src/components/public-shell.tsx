import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Pages anyone can read without signing in: the landing page and /about/qloo. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4 sm:px-8">
          <Link href="/" className="font-semibold">Common Ground</Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/about/qloo" className="hover:text-foreground">How it uses Qloo</Link>
          </nav>
          <Button size="sm" variant="ghost" className="ml-auto" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-8">
          <p>Cultural evidence from the Qloo Taste AI API. Qloo results describe aggregate affinities, not individual people.</p>
          <p>Demo roster: fictional creators for illustration.</p>
          <a href="https://github.com/miwas1/Common_ground" className="hover:text-foreground">Source (MIT)</a>
        </div>
      </footer>
    </div>
  );
}
