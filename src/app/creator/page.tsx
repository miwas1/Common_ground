import { eq, inArray } from "drizzle-orm";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { member } from "@/db/auth-schema";
import { creator, portfolioItem } from "@/db/schema";
import { pageActor } from "@/lib/auth/page";

async function CreatorHome() {
  const actor = await pageActor();
  const db = await getDb();
  const orgIds = (await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, actor.userId))).map((m) => m.id);
  const profiles = orgIds.length ? await db.select().from(creator).where(inArray(creator.organizationId, orgIds)) : [];
  const me = profiles[0];
  if (!me) return <p className="mt-6 text-sm text-muted-foreground">No creator profile is linked to this account.</p>;
  const items = await db.select().from(portfolioItem).where(eq(portfolioItem.creatorId, me.id));
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>{me.displayName}</CardTitle>
          <CardDescription>{me.proposition}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {items.map((p) => (
            <div key={p.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.role}</p>
              <p className="mt-1 text-xs">{p.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Opportunities</CardTitle>
          <CardDescription>Proposals appear here when a brand sends you an offer for a specific version.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default function CreatorPage() {
  return (
    <AppShell area="creator">
      <h1 className="text-2xl font-semibold tracking-tight">Work</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-48 w-full" />}>
        <CreatorHome />
      </Suspense>
    </AppShell>
  );
}
