// A made-up customer research document for the example brand (Juniper Coffee), so the showcase and the
// demo workspace have a brand profile to check directions against. It says plainly that it is made up.
// Every statement's quote is copied from the text, as the real extraction requires.

import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { brandDocument, brandFact } from "@/db/schema";
import { normalizeText, pageOf, type FactKind } from "@/lib/brand/extract";

export const EXAMPLE_RESEARCH_NAME = "Customer interviews, spring (made-up example)";

export const EXAMPLE_RESEARCH_TEXT = `[page 1]
Juniper Coffee: customer interviews, spring. This is a made-up example document for the Common Ground demo.

We spoke with fourteen customers who bought the cold brew concentrate in the last three months.

Convenience came up more than anything else. Most people said they buy it because it is quicker than a café run on busy weekday mornings. "I want good iced coffee in under a minute, not a ritual," one customer told us.

Only a few customers talked about how the coffee is made or where the beans come from; craftsmanship mattered less to them than speed and price.

Hosting came up often: several customers make coffee desserts or iced drinks when friends come over at the weekend.

[page 2]
Results from last summer's creator test: hosting videos had a higher hook rate than morning-routine videos.

Team view: we think our customers are mostly urban professionals in their thirties.

Brand rules: no alcohol pairings; no claims about caffeine or health.`;

const STATEMENTS: { kind: FactKind; text: string; quote: string }[] = [
  { kind: "research", text: "Convenience matters most: customers buy it because it's quicker than a café run on busy weekday mornings.", quote: "Convenience came up more than anything else." },
  { kind: "research", text: "Customers want good iced coffee fast, not a ritual.", quote: "I want good iced coffee in under a minute, not a ritual," },
  { kind: "research", text: "Craftsmanship matters less to customers than speed and price.", quote: "craftsmanship mattered less to them than speed and price" },
  { kind: "research", text: "Customers use it when hosting: coffee desserts and iced drinks when friends come over at the weekend.", quote: "several customers make coffee desserts or iced drinks when friends come over at the weekend" },
  { kind: "measured", text: "Hosting videos had a higher hook rate than morning-routine videos in last summer's creator test.", quote: "hosting videos had a higher hook rate than morning-routine videos" },
  { kind: "belief", text: "Customers are mostly urban professionals in their thirties.", quote: "we think our customers are mostly urban professionals in their thirties" },
  { kind: "avoid", text: "No alcohol pairings.", quote: "no alcohol pairings" },
  { kind: "avoid", text: "No claims about caffeine or health.", quote: "no claims about caffeine or health" },
];

/** Give a brand the example profile once (idempotent by document name). */
export async function ensureExampleProfile(db: Db, organizationId: string) {
  const [existing] = await db
    .select({ id: brandDocument.id })
    .from(brandDocument)
    .where(and(eq(brandDocument.brandOrganizationId, organizationId), eq(brandDocument.name, EXAMPLE_RESEARCH_NAME)));
  if (existing) return false;
  const text = normalizeText(EXAMPLE_RESEARCH_TEXT);
  for (const s of STATEMENTS) {
    if (!text.includes(normalizeText(s.quote))) throw new Error(`Example statement quote not in the document: ${s.quote}`);
  }
  const [doc] = await db
    .insert(brandDocument)
    .values({ brandOrganizationId: organizationId, name: EXAMPLE_RESEARCH_NAME, text: EXAMPLE_RESEARCH_TEXT, pages: 2 })
    .returning({ id: brandDocument.id });
  await db.insert(brandFact).values(
    STATEMENTS.map((s) => ({
      brandOrganizationId: organizationId,
      kind: s.kind,
      text: s.text,
      documentId: doc.id,
      quote: s.quote,
      page: pageOf(EXAMPLE_RESEARCH_TEXT, s.quote),
      status: "approved",
      createdBy: "model",
      decidedAt: new Date(),
    })),
  );
  return true;
}
