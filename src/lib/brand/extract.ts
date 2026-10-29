// Turning a brand's documents into reviewable statements. The model proposes statements, each with a
// passage it says it copied; code keeps only statements whose passage really is in the document, and
// works out the page from where the passage sits. Nothing extracted is used until a person approves it.

import { z } from "zod";
import { checkClaims } from "@/lib/claims/validate";
import type { Llm } from "@/lib/llm";

export const FACT_KINDS = ["research", "belief", "measured", "product", "positioning", "tone", "approved_claim", "avoid"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FACT_KIND_LABEL: Record<FactKind, string> = {
  research: "From customer research",
  belief: "What your team believes",
  measured: "Measured in past campaigns",
  product: "Product facts",
  positioning: "Positioning",
  tone: "Tone of voice",
  approved_claim: "Approved claims",
  avoid: "Things to avoid",
};

/** Characters read from one document. Longer documents are read up to here, and the user is told. */
export const MAX_DOCUMENT_CHARS = 120_000;
const MAX_STATEMENTS = 25;

const Extracted = z.object({
  statements: z.array(
    z.object({
      kind: z.enum(FACT_KINDS),
      text: z.string().describe("The statement in plain words, at most 25 words"),
      quote: z.string().describe("The passage it comes from, copied exactly from the document, at most 300 characters"),
    }),
  ),
});

const SYSTEM = `You read a brand's document and pull out what the brand knows, for a creative strategy tool.
Kinds:
- research: what customers said or did, from interviews, surveys, reviews or data. Only use it when the document reports evidence from customers; launch dates, prices, availability, specs and company announcements are never research.
- belief: what the brand team thinks or assumes, not backed by research in the document.
- measured: results of past campaigns or content (numbers allowed).
- product: facts about the product, including its price, availability, launch and release dates.
- positioning: how the brand describes its place in the market.
- tone: how the brand speaks.
- approved_claim: claims the brand has cleared to make.
- avoid: things the brand must not say, show or do.
Rules: the quote must be copied character for character from the document. Only state what the document says. Keep at most ${MAX_STATEMENTS} statements, preferring customer research, measured results and rules over general description.`;

/** Lowercase, straight quotes, single spaces: how passages are compared with the document. */
export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** The page a passage is on, from the "[page N]" markers before it; null if the document has none. */
export function pageOf(documentText: string, quote: string): number | null {
  const doc = normalizeText(documentText);
  const at = doc.indexOf(normalizeText(quote));
  if (at < 0) return null;
  const markers = [...doc.slice(0, at).matchAll(/\[page (\d+)\]/g)];
  return markers.length ? Number(markers[markers.length - 1][1]) : null;
}

export type ExtractedStatement = { kind: FactKind; text: string; quote: string; page: number | null };

export async function extractStatements(llm: Llm, doc: { name: string; text: string }) {
  const truncated = doc.text.length > MAX_DOCUMENT_CHARS;
  const body = doc.text.slice(0, MAX_DOCUMENT_CHARS);
  const normalized = normalizeText(body);
  const verified = (s: { quote: string }) => s.quote.trim().length >= 12 && normalized.includes(normalizeText(s.quote));

  let best: ExtractedStatement[] = [];
  let dropped = 0;
  let followUp: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const out = await llm.object({
      name: "brand document",
      system: SYSTEM,
      prompt: `<document name="${doc.name.replaceAll('"', "'")}">\n${body}\n</document>\nPull out the statements.`,
      schema: Extracted,
      effort: "medium",
      followUp,
    });
    const statements = out.statements.slice(0, MAX_STATEMENTS);
    const ok = statements
      .filter((s) => verified(s) && s.text.trim() && checkClaims(s.text, "text").length === 0)
      .map((s) => ({ kind: s.kind, text: s.text.trim(), quote: s.quote.trim(), page: pageOf(body, s.quote) }));
    if (ok.length >= best.length) {
      best = ok;
      dropped = statements.length - ok.length;
    }
    if (dropped === 0 || attempt === 2) break;
    const missing = statements.filter((s) => !verified(s)).map((s) => `- "${s.quote.slice(0, 120)}"`);
    followUp = `<previous_attempt_problems>\nThese quotes are not in the document word for word. Copy each quote exactly as it appears, or leave the statement out:\n${missing.join("\n")}\n</previous_attempt_problems>`;
  }
  return { statements: best, dropped, truncated };
}

/** Plain text from an uploaded file: PDFs page by page with "[page N]" markers, text files as they are. */
export async function documentText(file: File): Promise<{ text: string; pages: number | null }> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { text: new TextDecoder().decode(buffer), pages: null };
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buffer);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return { text: text.map((t, i) => `[page ${i + 1}]\n${t}`).join("\n\n"), pages: totalPages };
}
