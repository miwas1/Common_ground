// Plain-English labels for values stored by the pipeline. Pages show these, never the raw values,
// so campaigns researched before a wording change read the same as new ones.

export const SOURCE_LABEL: Record<string, string> = {
  research: "From customer research",
  team: "From your team",
  assumption: "A guess to test",
};

export const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  ugc_production: "Content for your channels",
  creator_distribution: "Posts to creators' followers",
  hybrid: "Content and posts",
};

export const PACKAGE_LABEL: Record<string, string> = {
  concentrated: "One idea, several creators",
  broad_test: "Test every direction",
  production_heavy: "Most content for the budget",
  hybrid: "Content plus posts",
};

/** Culture fit: where the creator ranked among the roster for one direction. */
export const BAND_LABEL: Record<string, string> = {
  "top quarter": "Strong",
  middle: "Medium",
  lower: "Weak",
  "not measured": "No data",
};

/** How well the creator's past work matches the kind of content the direction needs. */
export const CAPABILITY_LABEL: Record<string, string> = {
  strong: "Strong",
  partial: "Some",
  none: "None yet",
  "not assessed": "Not checked",
};

const FIT_LABEL: Record<string, string> = { aligned: "Yes", partial: "Partly", unclear: "Unclear" };

type Check = Record<string, unknown> | undefined;

/** The three direction checks as short answers to plain questions. */
export function checkLines(checks: Record<string, Check>) {
  const { coherence: c, sensitivity: s, relevance: r } = checks;
  const changesWhen = ((s?.tested ?? []) as { input: string; stable: boolean }[]).filter((t) => !t.stable).map((t) => t.input);
  return [
    {
      question: "Does it hang together?",
      answer: !c?.measured ? "Couldn't check" : Number(c.share) >= 0.75 && Number(c.meanAffinity) >= 0.6 ? "Yes" : "Loosely",
    },
    {
      question: "Does it hold up if you drop one input?",
      answer: !s?.measured ? "Couldn't check" : changesWhen.length === 0 ? "Yes" : `It changes without ${changesWhen.join(", ")}`,
      note: s?.dependsOnAssumption ? "It leans on one of your guesses." : undefined,
    },
    {
      question: "Does it suit your audience?",
      answer: r?.measured ? (FIT_LABEL[String(r.fit)] ?? "Unclear") : "Couldn't check",
      note: r?.measured ? undefined : "Add an audience group to the brief to check this.",
    },
  ];
}
