import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { signOut } from "@/app/actions";
import { AppNav, CurrentAppNav } from "@/components/app-nav";
import { Mark } from "@/components/public-shell";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/brand" className="flex items-center gap-2 font-semibold">
            <Mark />
            Common Ground
          </Link>
          {/* The path is request data: the unmarked nav is prerendered and the marked one streams in. */}
          <Suspense fallback={<AppNav />}>
            <CurrentAppNav />
          </Suspense>
          <form action={signOut} className="ml-auto">
            <Button variant="ghost" size="sm" type="submit">Sign out</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
