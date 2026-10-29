// A proposal brief that leaves the app: the document a brand team sends to a creator or a client.
// Built from stored data only (the proposal's current version, its claims and quote); no new
// model output. Rendered as a print page and as Markdown from the same structure.

import { formatFee } from "@/lib/pipeline/money";

export type BriefDoc = {
  campaign: string;
  brand: string;
  product: { name: string; description: string };
  objective: string;
  markets: string[];
  revision: number;
  direction: { title: string; audienceContext: string; productRole: string; palette?: string; moodWords: string[]; settings: string[] };
  creator: { name: string; city: string; proposition: string | null; isDemo: boolean };
  concept: { title: string; logline: string; hook: string; beats: string[]; productIntegration: string; setting: string };
  deliverables: { format: string; count: number; notes: string }[];
  terms: { package: string; amountCents: number | null; currency: string; usageTerms: string; validUntil: string | null };
  hypothesis: string;
  openQuestions: string[];
  /** Interpretations, each with the Qloo findings it rests on. */
  why: { text: string; findings: string[] }[];
  relevantWork: { text: string; titles: string[] }[];
  version: number;
  generatedAt: string;
};

export const QLOO_NOTE = "Cultural data comes from Qloo. It describes groups of people with shared tastes, not individuals.";

/** Model-written hooks sometimes arrive already in quotation marks; the brief adds its own. */
export const unquote = (text: string) => text.trim().replace(/^["“”']+|["“”']+$/g, "");

export function briefFilename(doc: Pick<BriefDoc, "creator" | "concept">) {
  const slug = `${doc.creator.name} ${doc.concept.title}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80);
  return `brief-${slug || "proposal"}.md`;
}

export function briefToMarkdown(doc: BriefDoc): string {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);
  push(`# ${doc.concept.title}`, "", `**${doc.creator.name}** × **${doc.brand}** · ${doc.product.name}`, "");
  push(`> ${doc.concept.logline}`, "");

  push("## The brief", "");
  push(`- **Campaign:** ${doc.campaign}`);
  push(`- **Goal:** ${doc.objective}`);
  push(`- **Product:** ${doc.product.name}${doc.product.description ? ` — ${doc.product.description}` : ""}`);
  push(`- **Markets:** ${doc.markets.join(", ")}`, "");

  push(`## Creative direction: ${doc.direction.title}`, "");
  push(doc.direction.audienceContext, "");
  push(`**Where the product fits:** ${doc.direction.productRole}`, "");
  const art = [
    doc.direction.palette ? `palette ${doc.direction.palette}` : "",
    doc.direction.settings.length ? `settings ${doc.direction.settings.join(", ")}` : "",
    doc.direction.moodWords.length ? `mood ${doc.direction.moodWords.join(", ")}` : "",
  ].filter(Boolean);
  if (art.length) push(`**Look and feel:** ${art.join("; ")}`, "");

  push("## Concept", "");
  push(`**Opening line:** “${unquote(doc.concept.hook)}”`, "");
  doc.concept.beats.forEach((b, i) => push(`${i + 1}. ${b}`));
  push("", `**How the product appears:** ${doc.concept.productIntegration}`, "", `**Setting:** ${doc.concept.setting}`, "");

  push("## What gets made", "");
  for (const d of doc.deliverables) push(`- ${d.count} × ${d.format}${d.notes ? ` — ${d.notes}` : ""}`);
  push("");

  push("## Price", "");
  push(doc.terms.amountCents === null ? "- **Fee:** Quote required" : `- **Fee:** ${formatFee(doc.terms)} for “${doc.terms.package}”`);
  push(`- **Usage:** ${doc.terms.usageTerms}`);
  if (doc.terms.validUntil) push(`- **Quote valid until:** ${doc.terms.validUntil.slice(0, 10)}`);
  push("");

  push("## What this tests", "", doc.hypothesis, "");

  if (doc.why.length) {
    push("## Why this collaboration", "");
    for (const w of doc.why) {
      push(`- ${w.text}`);
      for (const f of w.findings) push(`  - *Qloo data:* ${f}`);
    }
    push("");
  }

  if (doc.relevantWork.length) {
    push(`## ${doc.creator.name}'s relevant work`, "");
    for (const w of doc.relevantWork) push(`- ${w.text}${w.titles.length ? ` (${w.titles.map((t) => `“${t}”`).join(", ")})` : ""}`);
    push("");
  }

  if (doc.openQuestions.length) {
    push("## Still to agree", "");
    for (const q of doc.openQuestions) push(`- ${q}`);
    push("");
  }

  push("---", "");
  push(`Prepared with Common Ground on ${doc.generatedAt.slice(0, 10)}.`);
  if (doc.why.some((w) => w.findings.length)) push("", QLOO_NOTE);
  if (doc.creator.isDemo) push("", "This is a made-up demo creator.");
  return `${lines.join("\n")}\n`;
}
