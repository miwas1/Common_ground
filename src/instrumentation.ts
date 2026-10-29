// Server startup hook (Next.js instrumentation). Node.js-only work lives in instrumentation-node.ts,
// imported conditionally as the Next.js docs recommend, so the Edge build never sees it.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNode } = await import("./instrumentation-node");
    await startNode();
  }
}
