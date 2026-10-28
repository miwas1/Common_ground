<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Common Ground project rules

- Product and build plan: `PLAN.md`. Hackathon rules and Qloo API notes: `RESEARCH.md`.
- All Qloo access goes through `src/lib/qloo` (`qlooFor()` in server code). Never call Qloo from the browser or expose `QLOO_API_KEY`.
- Database: Postgres via Drizzle (`getDb()` in `src/db`). Local dev and tests use embedded PGlite (no `DATABASE_URL`); production uses Neon (`DATABASE_URL` set). Write only Postgres features both support; Neon's HTTP driver has no interactive transactions, so avoid `db.transaction()`. Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate`.
- Durable runs: Workflow SDK workflows live in `src/workflows` ("use workflow" / "use step"). Steps must be idempotent; record progress with `markStage()` from `src/lib/runs/stages.ts`. Local recovery depends on `src/instrumentation.ts`. Read `node_modules/workflow/docs` before changing workflow code.
- Identity: Better Auth via `getAuth()` (`src/lib/auth/server.ts`); options shared with `auth.cli.ts`. After changing auth plugins, run `pnpm auth:generate`. Every campaign/creator action must be authorized against organization membership.
- Never commit Qloo response data (fixtures, snapshots, seed dumps). Unit tests use synthetic fixtures; live checks live in `*.live.test.ts`.
- Agent output may only cite evidence IDs that came from Qloo calls; validate with Zod before rendering.
- Before finishing a change: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
