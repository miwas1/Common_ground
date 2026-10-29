import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PGlite ships WASM and data files; load it with Node require instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  // Brand documents are uploaded through a server action. Vercel caps function bodies at 4.5 MB.
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Enables "use workflow" / "use step" (durable research runs, PLAN.md §3.2).
export default withWorkflow(nextConfig);
