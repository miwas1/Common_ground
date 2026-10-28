import "server-only";

import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { getActor } from "./actor";
import { authorize, AuthorizationError, type Action } from "./authorize";

/** The signed-in user for a page, or a redirect to sign-in. */
export async function pageActor() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  return actor;
}

/** Authorize a page's resource; hidden resources render as 404, never as "forbidden". */
export async function pageAuthorize(action: Action) {
  const actor = await pageActor();
  try {
    return { actor, grant: await authorize(await getDb(), actor, action) };
  } catch (err) {
    if (err instanceof AuthorizationError && err.code === "not_found") notFound();
    throw err;
  }
}
