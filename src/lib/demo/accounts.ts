// The seeded demo identity for the one-click judge path (PLAN.md §3.3). Common Ground is a tool for
// brand teams; creators exist only as the casting roster and have no login.
// Fictional people and organizations; example.com addresses never receive mail.

export const DEMO_ACCOUNTS = {
  brand: {
    user: { name: "Alex Rivera", email: "alex.rivera@example.com" },
    organization: { name: "Juniper Coffee (demo)", slug: "demo-juniper-coffee", kind: "brand" },
  },
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

/** The creator login that earlier deploys seeded; removed by seedDemoIdentities. */
export const RETIRED_DEMO_EMAILS = ["maya.l@example.com"];
