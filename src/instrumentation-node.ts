// Node.js-only startup work, imported from instrumentation.ts (Next.js calls `register` in every runtime).
// The Workflow SDK's local backend re-enqueues unfinished runs only when its World is started,
// so a crashed or restarted dev server resumes research runs. On Vercel the managed backend
// handles recovery itself, and starting it here would only add cold-start time.

export async function startNode() {
  if (process.env.VERCEL) return;
  // Locally, close PGlite before the process exits so stopping `pnpm dev` can't corrupt .pglite.
  const { closeLocalDb } = await import("@/db");
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      closeLocalDb().finally(() => process.exit(0));
    });
  }
  const { getWorld } = await import("workflow/runtime");
  const world = await getWorld();
  await world.start?.();
}
