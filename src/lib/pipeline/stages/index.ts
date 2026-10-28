import type { StageCtx } from "../context";
import { audienceRead } from "./audience";
import { parseBrief } from "./brief";
import { cast } from "./cast";
import { checkDirections } from "./checks";
import { synthesizeDirections } from "./directions";
import { explore } from "./explore";
import { writeProposals } from "./proposals";
import { resolveReferences } from "./resolve";
import { planBudget } from "./budget";

export type StageDef = { position: number; name: string; run: (ctx: StageCtx) => Promise<unknown> };

/** The research pipeline, in order. Names are shown to users while a run is in progress. */
export const STAGES: StageDef[] = [
  { position: 1, name: "Reading the brief", run: parseBrief },
  { position: 2, name: "Matching references to Qloo", run: resolveReferences },
  { position: 3, name: "Reading the audience", run: audienceRead },
  { position: 4, name: "Exploring cultural worlds", run: explore },
  { position: 5, name: "Shaping directions", run: synthesizeDirections },
  { position: 6, name: "Checking directions", run: checkDirections },
  { position: 7, name: "Casting creators", run: cast },
  { position: 8, name: "Writing proposals", run: writeProposals },
  { position: 9, name: "Planning budget packages", run: planBudget },
];

export const stageName = (position: number) => STAGES.find((s) => s.position === position)?.name ?? `Stage ${position}`;
