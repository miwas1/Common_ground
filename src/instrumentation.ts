// Server startup hook (Next.js instrumentation).
// The Workflow SDK's local backend re-enqueues unfinished runs only when its World is started,
// so a crashed or restarted dev server resumes research runs. On Vercel the managed backend
// handles recovery itself, and starting it here would only add cold-start time.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const { getWorld } = await import("workflow/runtime");
  const world = await getWorld();
  await world.start?.();
}
