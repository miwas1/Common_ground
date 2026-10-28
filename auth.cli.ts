// Entry point for the Better Auth CLI only (schema generation): `pnpm auth:generate`.
// The app itself uses src/lib/auth/server.ts, which adds the database adapter.
import { betterAuth } from "better-auth";
import { authOptions } from "./src/lib/auth/options";

export const auth = betterAuth(authOptions());
