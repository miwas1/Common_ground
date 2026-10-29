import "server-only";

import { headers } from "next/headers";
import { getDb } from "@/db";
import { authorize, type Action, type Actor, type Grant } from "./authorize";
import { getAuth } from "./server";

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor() {
    super("Sign in required");
    this.name = "UnauthenticatedError";
  }
}

/** The signed-in user for this request, or null. */
export async function getActor(): Promise<(Actor & { activeOrganizationId: string | null }) | null> {
  // Request headers first: while prerendering, this is where rendering stops, before the database is opened.
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { userId: session.user.id, activeOrganizationId: session.session.activeOrganizationId ?? null };
}

/** Resolve the signed-in user and check the action; throws 401/403/404-style errors. */
export async function requireAuthorized(action: Action): Promise<Actor & Grant> {
  const actor = await getActor();
  if (!actor) throw new UnauthenticatedError();
  const grant = await authorize(await getDb(), actor, action);
  return { userId: actor.userId, ...grant };
}
