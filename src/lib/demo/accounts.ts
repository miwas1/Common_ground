// Seeded demo identities for the one-click judge path (PLAN.md §3.3).
// Fictional people and organizations; example.com addresses never receive mail.

export const DEMO_ACCOUNTS = {
  brand: {
    user: { name: "Alex Rivera", email: "alex.rivera@example.com" },
    organization: { name: "Juniper Coffee (demo)", slug: "demo-juniper-coffee", kind: "brand" },
  },
  creator: {
    user: { name: "Maya L.", email: "maya.l@example.com" },
    organization: { name: "Maya L. Studio (demo)", slug: "demo-maya-l-studio", kind: "creator" },
  },
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;
