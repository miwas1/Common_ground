import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Neon when DATABASE_URL is set (production); otherwise the local PGlite directory.
// The app also migrates PGlite automatically on first connection.
const url = process.env.DATABASE_URL;

export default url
  ? defineConfig({
      schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
      out: "./drizzle",
      dialect: "postgresql",
      dbCredentials: { url },
    })
  : defineConfig({
      schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
      out: "./drizzle",
      dialect: "postgresql",
      driver: "pglite",
      dbCredentials: { url: process.env.PGLITE_DATA_DIR ?? "./.pglite" },
    });
