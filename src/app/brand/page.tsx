import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { member } from "@/db/auth-schema";
import { campaign } from "@/db/schema";
import { pageActor } from "@/lib/auth/page";
import { findShowcase } from "@/lib/demo/showcase";

const STATUS_LABEL: Record<string, string> = {
  brief_draft: "Brief draft",
  researching: "Researching",
  reviewing_proposals: "Reviewing proposals",
  in_production: "In production",
  complete: "Complete",
};

async function Campaigns() {
  const actor = await pageActor();
  const db = await getDb();
  const orgIds = (await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, actor.userId))).map((m) => m.id);
  const rows = orgIds.length
    ? await db.select().from(campaign).where(inArray(campaign.organizationId, orgIds)).orderBy(desc(campaign.createdAt))
    : [];

  const showcase = await findShowcase(db);
  const showcaseCard = showcase && (
    <Link href={`/brand/campaigns/${showcase.id}`} className="mt-6 block">
      <Card className="transition hover:ring-primary/40">
        <CardHeader>
          <CardTitle>Showcase: cold brew concentrate launch</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Read-only</Badge>
            A finished example: the example brief researched with real Qloo data, from cultural directions to proposals and budget packages.
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );

  if (rows.length === 0) {
    return (
      <>
        {showcaseCard}
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Start your first campaign</CardTitle>
            <CardDescription>Describe the product, the audience you know about and the work you need. The agent researches cultural directions and drafts collaboration proposals.</CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }
  return (
    <>
      {showcaseCard}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {rows.map((c) => (
          <Link key={c.id} href={`/brand/campaigns/${c.id}`}>
            <Card className="transition hover:ring-primary/40">
              <CardHeader>
                <CardTitle>{c.name}</CardTitle>
                <CardDescription>
                  <Badge variant="secondary">{STATUS_LABEL[c.status] ?? c.status}</Badge>
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function BrandHome() {
  return (
    <AppShell area="brand">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <Button asChild>
          <Link href="/brand/campaigns/new">New campaign</Link>
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="mt-6 h-24 w-full" />}>
        <Campaigns />
      </Suspense>
    </AppShell>
  );
}
