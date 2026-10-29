"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/app/actions";
import { getDb } from "@/db";
import { getActor, requireAuthorized, UnauthenticatedError } from "@/lib/auth/actor";
import { actingBrandOrg } from "@/lib/auth/brand";
import { documentText, FACT_KINDS, type FactKind } from "@/lib/brand/extract";
import { addDocument, addFact, approveAllSuggested, decideFact, ProfileError, removeDocument, removeFact } from "@/lib/brand/profile";
import { anthropicLlm } from "@/lib/llm";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
/** Under next.config's 4.5 MB server action limit, which matches Vercel's request cap. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** The signed-in user and the brand whose profile they manage; the organization comes from their membership. */
async function profile() {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  const organizationId = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  if (!organizationId) throw new ProfileError("Your account needs a brand workspace first.");
  await requireAuthorized({ type: "profile.manage", organizationId });
  return { db: await getDb(), userId: actor.userId, org: organizationId };
}

export async function uploadDocumentAction(_prev: FormState, form: FormData): Promise<FormState> {
  let target = "";
  try {
    const { db, userId, org } = await profile();
    const file = form.get("file");
    let doc: { name: string; text: string; pages: number | null };
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) throw new ProfileError("Upload files up to 4 MB.");
      doc = { name: str(form, "name") || file.name, ...(await documentText(file)) };
    } else if (str(form, "text")) {
      doc = { name: str(form, "name") || "Pasted notes", text: str(form, "text"), pages: null };
    } else {
      throw new ProfileError("Choose a file or paste some text.");
    }
    const res = await addDocument(db, anthropicLlm(), org, userId, doc);
    target = `/brand/profile?document=${res.documentId}&found=${res.suggested}&dropped=${res.dropped}${res.truncated ? "&truncated=1" : ""}#review`;
  } catch (err) {
    if (err instanceof ProfileError) return { error: err.message };
    throw err;
  }
  redirect(target);
}

export async function decideFactAction(factId: string, decision: "approved" | "rejected", form: FormData) {
  const { db, userId, org } = await profile();
  const kind = FACT_KINDS.find((k) => k === str(form, "kind")) as FactKind | undefined;
  await decideFact(db, org, userId, factId, decision, kind);
  redirect("/brand/profile#review");
}

export async function approveAllAction(documentId: string) {
  const { db, userId, org } = await profile();
  await approveAllSuggested(db, org, userId, documentId);
  redirect("/brand/profile");
}

export async function addFactAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { db, userId, org } = await profile();
    await addFact(db, org, userId, { kind: str(form, "kind"), text: str(form, "text") });
  } catch (err) {
    if (err instanceof ProfileError) return { error: err.message };
    throw err;
  }
  redirect("/brand/profile");
}

export async function removeFactAction(factId: string) {
  const { db, org } = await profile();
  await removeFact(db, org, factId);
  redirect("/brand/profile");
}

export async function removeDocumentAction(documentId: string) {
  const { db, org } = await profile();
  await removeDocument(db, org, documentId);
  redirect("/brand/profile");
}
