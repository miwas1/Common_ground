"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/app/actions";
import { getDb } from "@/db";
import { requireAuthorized } from "@/lib/auth/actor";
import { anthropicLlm } from "@/lib/llm";
import { editProposal, ProposalError, simplerVersion, swapCreator, type Deliverable } from "@/lib/proposals/control";
import { qlooFor } from "@/lib/qloo/server";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const lines = (form: FormData, key: string) => str(form, key).split("\n").map((l) => l.trim()).filter(Boolean);

/** "2 × Vertical video — with hooks" → { count: 2, format: "Vertical video", notes: "with hooks" } */
function deliverable(line: string): Deliverable {
  const m = line.match(/^(\d+)\s*[×x*]\s*(.+?)(?:\s+[—–-]\s+(.*))?$/i);
  return m ? { count: Number(m[1]), format: m[2].trim(), notes: m[3]?.trim() ?? "" } : { count: 1, format: line, notes: "" };
}

async function attempt(fn: () => Promise<string>): Promise<FormState | string> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ProposalError) return { error: err.message };
    throw err;
  }
}

export async function editProposalAction(campaignId: string, proposalId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireAuthorized({ type: "proposal.revise", proposalId });
  const result = await attempt(async () => {
    await editProposal(await getDb(), proposalId, userId, {
      concept: {
        title: str(form, "title"),
        logline: str(form, "logline"),
        hook: str(form, "hook"),
        beats: lines(form, "beats"),
        productIntegration: str(form, "productIntegration"),
        setting: str(form, "setting"),
        openQuestions: lines(form, "openQuestions"),
      },
      deliverables: lines(form, "deliverables").map(deliverable),
      hypothesis: str(form, "hypothesis"),
    });
    return proposalId;
  });
  if (typeof result !== "string") return result;
  redirect(`/brand/campaigns/${campaignId}/proposals/${proposalId}?changed=edit`);
}

export async function simplerAction(campaignId: string, proposalId: string) {
  const { userId } = await requireAuthorized({ type: "proposal.revise", proposalId });
  await simplerVersion(await getDb(), anthropicLlm(), proposalId, userId);
  redirect(`/brand/campaigns/${campaignId}/proposals/${proposalId}?changed=simpler`);
}

export async function swapCreatorAction(campaignId: string, proposalId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireAuthorized({ type: "proposal.revise", proposalId });
  const creatorId = str(form, "creatorId");
  if (!creatorId) return { error: "Choose who should take this proposal." };
  let next: string | null = null;
  const result = await attempt(async () => {
    const swapped = await swapCreator(await getDb(), { qloo: qlooFor(campaignId), llm: anthropicLlm() }, proposalId, creatorId, userId, str(form, "reason"));
    next = swapped.proposalId;
    return next;
  });
  if (typeof result !== "string") return result;
  redirect(`/brand/campaigns/${campaignId}/proposals/${next}?changed=swap`);
}
