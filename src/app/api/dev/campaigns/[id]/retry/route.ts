// Development only: start a fresh run for a campaign over HTTP (same path as the retry button). 404 in production.
import { retryResearch } from "@/lib/campaigns/runs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not found" }, { status: 404 });
  const { id } = await params;
  return Response.json({ campaignId: await retryResearch(id) });
}
