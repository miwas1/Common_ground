import type { StageCtx } from "../context";
import { audienceRead } from "./audience";
import { parseBrief } from "./brief";
import { cast } from "./cast";
import { checkDirections } from "./checks";
import { synthesizeDirections } from "./directions";
import { discoverCreators } from "./discover";
import { checkAgainstProfile } from "./fit";
import { explore } from "./explore";
import { writeProposals } from "./proposals";
import { resolveReferences } from "./resolve";
import { understandBrief } from "./understand";
import { planBudget } from "./budget";

export type StageDef = {
  /** Stable ID stored on run_stage rows. Run order is this list's order, not the number. */
  position: number;
  name: string;
  /** What the stage is doing, shown while it runs. */
  doing: string;
  /** Typical duration in seconds, used for the time estimate until real runs have been timed. */
  typicalSeconds: number;
  run: (ctx: StageCtx) => Promise<unknown>;
};

/** The research pipeline, in order. Names are shown to users while a run is in progress. */
export const STAGES: StageDef[] = [
  { position: 0, name: "Understanding your brief", doing: "Searching the web for your brand, product and market", typicalSeconds: 45, run: understandBrief },
  { position: 1, name: "Reading the brief", doing: "Pulling out your goal, audience and the names that matter", typicalSeconds: 15, run: parseBrief },
  { position: 2, name: "Looking up the names you gave", doing: "Matching those names to Qloo's catalogue", typicalSeconds: 20, run: resolveReferences },
  { position: 3, name: "Reading the audience", doing: "Checking what Qloo knows about the people who like these things", typicalSeconds: 20, run: audienceRead },
  { position: 4, name: "Finding related interests", doing: "Finding music, shows, places and brands these people also love", typicalSeconds: 25, run: explore },
  { position: 5, name: "Shaping creative directions", doing: "Turning the research into creative directions", typicalSeconds: 75, run: synthesizeDirections },
  { position: 6, name: "Checking the directions", doing: "Testing each direction for fit and how much it leans on one input", typicalSeconds: 40, run: checkDirections },
  { position: 11, name: "Checking against what you know", doing: "Comparing each direction with your brand profile's research and results", typicalSeconds: 15, run: checkAgainstProfile },
  { position: 10, name: "Finding real creators", doing: "Asking Qloo which real creators' audiences share each direction's taste", typicalSeconds: 20, run: discoverCreators },
  { position: 7, name: "Picking creators", doing: "Scoring creators on their past work and culture fit", typicalSeconds: 45, run: cast },
  { position: 8, name: "Writing proposals", doing: "Writing a pitch and price for each matched creator", typicalSeconds: 120, run: writeProposals },
  { position: 9, name: "Building budget options", doing: "Fitting creators into your budget", typicalSeconds: 20, run: planBudget },
];

/** The stages a baseline run executes: everything except the ones that query Qloo. */
export const BASELINE_STAGES = [0, 1, 5, 7, 8, 9];

export const stagesFor = (mode: "qloo" | "baseline") => (mode === "baseline" ? STAGES.filter((s) => BASELINE_STAGES.includes(s.position)) : STAGES);

export const stageName = (position: number) => STAGES.find((s) => s.position === position)?.name ?? `Stage ${position}`;
