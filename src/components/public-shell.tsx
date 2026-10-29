import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Pages anyone can read without signing in: the landing page and /about/qloo.
 * `bleed` hands the children the full width so a page can lay out its own bands.
 */
export function PublicShell({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Mark />
            Common Ground
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <Link href="/#how-it-works" className="hover:text-foreground">How it works</Link>
            <Link href="/#inside" className="hover:text-foreground">Inside</Link>
            <Link href="/#use-cases" className="hover:text-foreground">Use cases</Link>
            <Link href="/#features"className="hover:text-foreground">Features</Link>
            <Link href="/about/qloo" className="hover:text-foreground">How we use Qloo</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>
      {bleed ? (
        <main className="flex-1">{children}</main>
      ) : (
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">{children}</main>
      )}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-8">
          <p>Cultural data from Qloo. It describes groups of people with shared tastes, not individuals.</p>
          <p>Demo creators are made up.</p>
          <a href="https://github.com/miwas1/Common_ground" className="hover:text-foreground">Source (MIT)</a>
        </div>
      </footer>
    </div>
  );
}

/** Two overlapping circles: two worlds and the ground they share. */
export function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <circle cx="9" cy="12" r="6.5" fill="none" stroke="var(--direction-1)" strokeWidth="2" />
      <circle cx="15" cy="12" r="6.5" fill="none" stroke="var(--primary)" strokeWidth="2" />
    </svg>
  );
}
