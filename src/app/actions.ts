"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRun } from "workflow/api";
import { getDb } from "@/db";
import { run } from "@/db/schema";
import { getActor, requireAuthorized, UnauthenticatedError } from "@/lib/auth/actor";
import { getAuth } from "@/lib/auth/server";
import { createCampaignFromForm } from "@/lib/campaigns/create";
import { resolveAndResume, retryResearch, runCampaign } from "@/lib/campaigns/runs";
import { DEMO_ACCOUNTS, type DemoRole } from "@/lib/demo/accounts";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function signInAsDemo(role: DemoRole) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Demo access is not configured");
  const auth = await getAuth();
  await auth.api.signInEmail({ body: { email: DEMO_ACCOUNTS[role].user.email, password }, headers: await headers() });
  redirect(role === "brand" ? "/brand" : "/creator");
}

export async function signInWithEmail(form: FormData) {
  const auth = await getAuth();
  await auth.api.signInEmail({ body: { email: str(form, "email"), password: str(form, "password") }, headers: await headers() });
  redirect("/brand");
}

export async function signOut() {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export async function createCampaign(form: FormData) {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  const campaignId = await createCampaignFromForm(actor, form);
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
