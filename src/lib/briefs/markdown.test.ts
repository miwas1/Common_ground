import { describe, expect, it } from "vitest";
import { briefFilename, briefToMarkdown, QLOO_NOTE, type BriefDoc } from "./markdown";

const doc: BriefDoc = {
  campaign: "Summer coffee launch",
  brand: "Juniper Coffee",
  product: { name: "Cold Brew Concentrate", description: "A concentrate for iced coffee at home" },
  objective: "Launch with creator-made paid social",
  markets: ["US", "UK"],
  revision: 2,
  direction: { title: "The kitchen between courses", audienceContext: "People who could enjoy hosting.", productRole: "The base of a dessert drink.", palette: "warm neutrals", moodWords: ["calm"], settings: ["kitchen"] },
  creator: { name: "Maya Okafor", city: "Brooklyn", proposition: "Hosting at home", isDemo: true },
  concept: { title: "Dessert that waits", logline: "A host serves an iced dessert drink.", hook: "6am, before anyone wakes.", beats: ["Prep", "Pour", "Serve", "Toast"], productIntegration: "The concentrate is the base.", setting: "Small kitchen" },
  deliverables: [{ format: "vertical video", count: 3, notes: "With hooks" }],
  terms: { package: "3 videos", amountCents: 240_000, currency: "USD", usageTerms: "12 months paid social", validUntil: "2026-12-01T00:00:00.000Z" },
  hypothesis: "Tests whether hosting scenes hold attention.",
  openQuestions: ["Which hook the creator prefers"],
  why: [{ text: "Hosting could suit this creator's world.", findings: ["“Hosting” ranked #2 of 12 lifestyle concepts associated with Khruangbin."] }],
  relevantWork: [{ text: "Their hosting work shows ingredient demos.", titles: ["Sunday table"] }],
  version: 1,
  generatedAt: "2026-10-29T10:00:00.000Z",
};

describe("proposal brief markdown", () => {
  it("renders every section from stored data", () => {
    const md = briefToMarkdown(doc);
    expect(md).toMatch(/^# Dessert that waits\n/);
    for (const heading of ["## The brief", "## Creative direction: The kitchen between courses", "## Concept", "## What gets made", "## Price", "## What this tests", "## Why this collaboration", "## Still to agree"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("1. Prep\n2. Pour\n3. Serve\n4. Toast");
    expect(md).toContain("- **Fee:** $2,400 for “3 videos”");
    expect(md).toContain("- **Quote valid until:** 2026-12-01");
    expect(md).toContain("  - *Qloo data:* “Hosting” ranked #2 of 12");
    expect(md).toContain(QLOO_NOTE);
    expect(md).toContain("made-up demo creator");
  });

  it("leaves out empty sections and the Qloo note when nothing cites Qloo", () => {
    const md = briefToMarkdown({ ...doc, why: [], openQuestions: [], relevantWork: [], creator: { ...doc.creator, isDemo: false }, terms: { ...doc.terms, validUntil: null } });
    expect(md).not.toContain("## Why this collaboration");
    expect(md).not.toContain("## Still to agree");
    expect(md).not.toContain(QLOO_NOTE);
    expect(md).not.toContain("valid until");
    expect(md).not.toContain("made-up demo creator");
  });

  it("does not double-quote a hook that arrives quoted", () => {
    expect(briefToMarkdown({ ...doc, concept: { ...doc.concept, hook: '"6am, before anyone wakes."' } })).toContain("**Opening line:** “6am, before anyone wakes.”");
  });

  it("makes a safe file name", () => {
    expect(briefFilename({ creator: { ...doc.creator, name: "Zoë O'Brien" }, concept: { ...doc.concept, title: "Dessert / that waits!" } })).toBe("brief-zoe-obrien-dessert-that-waits.md");
  });
});
