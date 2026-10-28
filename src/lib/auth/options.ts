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
export function authOptions() {
  return {
    appName: "Common Ground",
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
