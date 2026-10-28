import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // PGlite suites boot WASM Postgres and run migrations in beforeAll (~8s, more in parallel).
  test: { environment: "node", include: ["src/**/*.test.ts"], hookTimeout: 60_000 },
});
