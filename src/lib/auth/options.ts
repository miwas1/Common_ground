// Better Auth configuration shared by the app (src/lib/auth/server.ts) and the schema CLI (auth.cli.ts).
// Identity model (PLAN.md §3.3): real users and organizations; brands and creators each act
// through an organization; multi-session lets one browser hold a brand and a creator account.

import type { BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { multiSession, organization } from "better-auth/plugins";

/** Invitation links are shown in the UI to copy (no email delivery in scope). */
export const invitationPath = (invitationId: string) => `/invitations/${invitationId}`;

// `satisfies` (not a return annotation) keeps the plugin types, so `auth.api` exposes plugin
// endpoints such as createOrganization and sessions carry activeOrganizationId.
const https = (host?: string) => (host ? `https://${host}` : undefined);

/**
 * Public origin. BETTER_AUTH_URL wins; on Vercel it is derived from system environment variables
 * (production domain in production, the branch URL on previews), so previews sign in correctly.
 */
function baseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production") return https(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return https(process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL);
}

/** Every URL a Vercel deployment can be reached at (unique deployment URL, branch URL, production domain). */
const vercelOrigins = () =>
  [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .map(https)
    .filter((o): o is string => Boolean(o));

export function authOptions() {
  return {
    appName: "Common Ground",
    baseURL: baseURL(),
    trustedOrigins: vercelOrigins(),
    emailAndPassword: { enabled: true },
    plugins: [
      organization({
        // Delivery is out of scope; the inviter copies the link from the UI.
        async sendInvitationEmail() {},
      }),
      multiSession(),
      // must stay last: applies Set-Cookie from server actions
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}
