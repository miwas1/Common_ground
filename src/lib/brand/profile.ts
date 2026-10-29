import "server-only";

// A brand's profile: what it knows, kept across campaigns. Statements come from documents (with the
// exact passage and page) or are typed in; only approved statements are used anywhere else.

import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { brandDocument, brandFact } from "@/db/schema";
import type { Llm } from "@/lib/llm";
import { extractStatements, FACT_KINDS, type FactKind } from "./extract";

export class ProfileError extends Error {}

export async function addDocument(db: Db, llm: Llm, org: string, userId: string, doc: { name: string; text: string; pages: number | null }) {
  const text = doc.text.replace(/\u0000/g, "").trim();
  if (text.length < 40) throw new ProfileError("That document has almost no text we can read. Scanned PDFs need text, not images.");
  const [d] = await db
    .insert(brandDocument)
    .values({ brandOrganizationId: org, name: doc.name.trim() || "Untitled document", text, pages: doc.pages, uploadedBy: userId })
    .returning({ id: brandDocument.id });
  const { statements, dropped, truncated } = await extractStatements(llm, { name: doc.name, text });
  if (statements.length) {
    await db.insert(brandFact).values(
      statements.map((s) => ({
        brandOrganizationId: org,
        kind: s.kind,
        text: s.text,
        documentId: d.id,
        quote: s.quote,
        page: s.page,
        status: "suggested",
        createdBy: "model",
        addedBy: userId,
      })),
    );
  }
  return { documentId: d.id, suggested: statements.length, dropped, truncated };
}

async function ownFact(db: Db, org: string, factId: string) {
  const [f] = await db.select().from(brandFact).where(and(eq(brandFact.id, factId), eq(brandFact.brandOrganizationId, org)));
  if (!f) throw new ProfileError("Statement not found.");
  return f;
}

export async function decideFact(db: Db, org: string, userId: string, factId: string, decision: "approved" | "rejected", kind?: FactKind) {
  await ownFact(db, org, factId);
  await db
    .update(brandFact)
    .set({ status: decision, decidedBy: userId, decidedAt: new Date(), ...(kind ? { kind } : {}) })
    .where(eq(brandFact.id, factId));
}

export async function approveAllSuggested(db: Db, org: string, userId: string, documentId: string) {
  await db
    .update(brandFact)
    .set({ status: "approved", decidedBy: userId, decidedAt: new Date() })
    .where(and(eq(brandFact.brandOrganizationId, org), eq(brandFact.documentId, documentId), eq(brandFact.status, "suggested")));
}

export async function addFact(db: Db, org: string, userId: string, input: { kind: string; text: string }) {
  const kind = FACT_KINDS.find((k) => k === input.kind);
  if (!kind) throw new ProfileError("Choose what kind of statement this is.");
  if (!input.text.trim()) throw new ProfileError("Write the statement.");
  await db.insert(brandFact).values({
    brandOrganizationId: org,
    kind,
    text: input.text.trim(),
    status: "approved",
    createdBy: "user",
    addedBy: userId,
    decidedBy: userId,
    decidedAt: new Date(),
  });
}

export async function removeFact(db: Db, org: string, factId: string) {
  await ownFact(db, org, factId);
  await db.delete(brandFact).where(eq(brandFact.id, factId));
}

export async function removeDocument(db: Db, org: string, documentId: string) {
  await db.delete(brandDocument).where(and(eq(brandDocument.id, documentId), eq(brandDocument.brandOrganizationId, org)));
}

export async function getProfile(db: Db, org: string) {
  const documents = await db
    .select({ id: brandDocument.id, name: brandDocument.name, pages: brandDocument.pages, createdAt: brandDocument.createdAt })
    .from(brandDocument)
    .where(eq(brandDocument.brandOrganizationId, org))
    .orderBy(desc(brandDocument.createdAt));
  const facts = await db.select().from(brandFact).where(eq(brandFact.brandOrganizationId, org)).orderBy(brandFact.createdAt);
  return { documents, facts };
}

/** Approved statements with their document name, for briefs and the per-direction check. */
export async function approvedFacts(db: Db, org: string, kinds?: FactKind[]) {
  const rows = await db
    .select({ fact: brandFact, documentName: brandDocument.name })
    .from(brandFact)
    .leftJoin(brandDocument, eq(brandDocument.id, brandFact.documentId))
    .where(and(eq(brandFact.brandOrganizationId, org), eq(brandFact.status, "approved"), ...(kinds ? [inArray(brandFact.kind, kinds)] : [])))
    .orderBy(brandFact.createdAt);
  return rows.map((r) => ({ ...r.fact, documentName: r.documentName }));
}
