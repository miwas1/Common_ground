"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRun } from "workflow/api";
import { getDb } from "@/db";
import { run } from "@/db/schema";
import { getActor, requireAuthorized, UnauthenticatedError } from "@/lib/auth/actor";
import { getAuth } from "@/lib/auth/server";
import { BriefError, createCampaignFromForm } from "@/lib/campaigns/create";
import { RevisionError, type RevisionChange } from "@/lib/campaigns/revisions";
import { refineCampaign, resolveAndResume, retryResearch, runCampaign } from "@/lib/campaigns/runs";
import { DEMO_ACCOUNTS, type DemoRole } from "@/lib/demo/accounts";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function signInAsDemo(role: DemoRole) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Demo access is not configured");
  const auth = await getAuth();
  await auth.api.signInEmail({ body: { email: DEMO_ACCOUNTS[role].user.email, password }, headers: await headers() });
  redirect(role === "brand" ? "/brand" : "/creator");
}

/** State returned to an `ActionForm` when an action fails in a way the user can fix. */
export type FormState = { error?: string } | undefined;

export async function signInWithEmail(_prev: FormState, form: FormData): Promise<FormState> {
  const auth = await getAuth();
  try {
    await auth.api.signInEmail({ body: { email: str(form, "email"), password: str(form, "password") }, headers: await headers() });
  } catch {
    return { error: "That email and password don't match an account." };
  }
  redirect("/brand");
}

export async function signOut() {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export async function createCampaign(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  let campaignId: string;
  try {
    campaignId = await createCampaignFromForm(actor, form);
  } catch (err) {
    if (err instanceof BriefError) return { error: err.message };
    throw err;
  }
  redirect(`/brand/campaigns/${campaignId}`);
}

/** The user's disambiguation choices; resumes the paused run once nothing is left to choose. */
export async function submitResolution(runId: string, form: FormData) {
  const choices = [...form.entries()]
    .filter(([k]) => k.startsWith("ref_"))
    .map(([k, v]) => ({ referenceId: k.slice(4), candidateId: v === "none" ? null : String(v) }));
  const { campaignId } = await resolveAndResume(runId, choices);
  redirect(`/brand/campaigns/${campaignId}`);
}

export async function retryResearchAction(campaignId: string) {
  await retryResearch(campaignId);
  redirect(`/brand/campaigns/${campaignId}`);
}

export async function cancelRun(runId: string) {
  const { run: r, campaignId } = await runCampaign(runId);
  await requireAuthorized({ type: "campaign.write", campaignId });
  const db = await getDb();
  await db.update(run).set({ cancelRequested: true, status: "cancelled" }).where(eq(run.id, runId));
  if (r.workflowRunId) await getRun(r.workflowRunId).cancel({ cancelReason: "Cancelled by user" }).catch(() => undefined);
  redirect(`/brand/campaigns/${campaignId}`);
}

/** Refine buttons submit `change` as "remove_reference:<id>", "remove_input:<id>" or "set_budget" (with `budget`). */
export async function refineAction(campaignId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const [type, id] = str(form, "change").split(":");
  const change: RevisionChange | null =
    type === "remove_reference" ? { type, referenceId: id } :
    type === "remove_input" ? { type, inputId: id } :
    type === "set_budget" ? { type, budgetCents: Math.round(Number(str(form, "budget").replace(/[^\d.]/g, "")) * 100) } :
    null;
  if (!change) return { error: "Choose what to change." };
  try {
    await refineCampaign(campaignId, change);
  } catch (err) {
    if (err instanceof RevisionError) return { error: err.message };
    throw err;
  }
  redirect(`/brand/campaigns/${campaignId}`);
}
