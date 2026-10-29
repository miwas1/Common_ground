"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import type { FormState } from "@/app/actions";
import { getActor, requireAuthorized, UnauthenticatedError } from "@/lib/auth/actor";
import { actingBrandOrg } from "@/lib/auth/brand";
import { qlooFor } from "@/lib/qloo/server";
import { parseCountry, parseCsv, parseMoney, cleanHandle, rowsToRoster, type RosterInput } from "@/lib/roster/csv";
import { addCreator, addDiscovered, importRoster, matchInQloo, removeFromRoster, RosterError, setAvailability, setRate, updateEntry } from "@/lib/roster/roster";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** The signed-in user and the brand roster they manage; the organization comes from their membership. */
async function roster(creatorId?: string) {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  const organizationId = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  if (!organizationId) throw new RosterError("Your account needs a brand workspace first.");
  await requireAuthorized(creatorId ? { type: "roster.creator", organizationId, creatorId } : { type: "roster.manage", organizationId });
  return { db: await getDb(), userId: actor.userId, org: organizationId };
}

function formInput(form: FormData): RosterInput {
  const input: RosterInput = { name: str(form, "name") };
  const ig = cleanHandle(str(form, "instagram"));
  if (ig) input.instagram = ig;
  if (str(form, "email")) input.email = str(form, "email");
  if (str(form, "manager")) input.manager = str(form, "manager");
  if (str(form, "city")) input.city = str(form, "city");
  const country = parseCountry(str(form, "country"));
  if (country) input.country = country;
  const rate = parseMoney(str(form, "rate"), str(form, "currency") || "USD");
  if (rate) input.rate = { ...rate, package: str(form, "package") || "Standard package", usageTerms: str(form, "usage") || "To agree" };
  const availability = str(form, "availability");
  if (availability === "available" || availability === "limited" || availability === "booked") input.availability = availability;
  if (str(form, "notes")) input.notes = str(form, "notes");
  if (form.get("preferred") === "on") input.preferred = true;
  if (str(form, "portfolio")) input.portfolio = [{ title: "Portfolio", url: str(form, "portfolio") }];
  return input;
}

async function attempt(fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RosterError) return { error: err.message };
    throw err;
  }
  return undefined;
}

export async function addCreatorAction(_prev: FormState, form: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const { db, userId, org } = await roster();
    const input = formInput(form);
    if (str(form, "rate") && !input.rate) throw new RosterError("Write the rate as an amount, like 1500 or $1,500.");
    await addCreator(db, qlooFor(), org, userId, input, "manual");
  });
  if (failed) return failed;
  redirect("/brand/creators");
}

export async function importCsvAction(_prev: FormState, form: FormData): Promise<FormState> {
  const file = form.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : str(form, "csv");
  if (!text) return { error: "Choose a CSV file or paste the rows." };
  const { entries, problems } = rowsToRoster(parseCsv(text));
  if (entries.length === 0) return { error: problems.map((p) => `Line ${p.line}: ${p.message}`).join(" ") || "No creators found in that file." };
  if (entries.length > 200) return { error: "Import up to 200 creators at a time." };
  const failed = await attempt(async () => {
    const { db, userId, org } = await roster();
    const report = await importRoster(db, qlooFor(), org, userId, entries);
    const note = [`${report.added} added`, report.existing ? `${report.existing} already on your roster` : "", `${report.matched} found in Qloo`, problems.length ? `${problems.length} notes` : ""].filter(Boolean).join(", ");
    redirect(`/brand/creators?imported=${encodeURIComponent(note)}`);
  });
  return failed;
}

export async function addDiscoveredAction(discoveredId: string) {
  const { db, userId, org } = await roster();
  const { campaignId } = await addDiscovered(db, org, userId, discoveredId);
  redirect(`/brand/campaigns/${campaignId}?added=${discoveredId}`);
}

export async function setPreferredAction(creatorId: string, preferred: boolean) {
  const { db, userId, org } = await roster(creatorId);
  await updateEntry(db, org, userId, creatorId, { preferred });
  redirect("/brand/creators");
}

export async function excludeAction(creatorId: string, form: FormData) {
  const { db, userId, org } = await roster(creatorId);
  await updateEntry(db, org, userId, creatorId, { excluded: true, exclusionReason: str(form, "reason") || null });
  redirect("/brand/creators");
}

export async function includeAction(creatorId: string) {
  const { db, userId, org } = await roster(creatorId);
  await updateEntry(db, org, userId, creatorId, { excluded: false });
  redirect("/brand/creators");
}

export async function saveNotesAction(creatorId: string, form: FormData) {
  const { db, userId, org } = await roster(creatorId);
  await updateEntry(db, org, userId, creatorId, { notes: str(form, "notes") });
  redirect("/brand/creators");
}

export async function setRateAction(creatorId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const failed = await attempt(async () => {
    const { db, userId, org } = await roster(creatorId);
    const money = parseMoney(str(form, "rate"), str(form, "currency") || "USD");
    if (!money) throw new RosterError("Write the rate as an amount, like 1500 or $1,500.");
    await setRate(db, org, userId, creatorId, { ...money, package: str(form, "package") || "Standard package", usageTerms: str(form, "usage") || "To agree" });
  });
  if (failed) return failed;
  redirect("/brand/creators");
}

export async function setAvailabilityAction(creatorId: string, form: FormData) {
  const status = str(form, "availability");
  if (status !== "available" && status !== "limited" && status !== "booked") return;
  const { db, userId, org } = await roster(creatorId);
  await setAvailability(db, org, userId, creatorId, status);
  redirect("/brand/creators");
}

export async function rematchAction(creatorId: string) {
  const { db, org } = await roster(creatorId);
  await matchInQloo(db, qlooFor(), org, creatorId);
  redirect("/brand/creators");
}

export async function removeAction(creatorId: string) {
  const { db, org } = await roster(creatorId);
  await removeFromRoster(db, org, creatorId);
  redirect("/brand/creators");
}
