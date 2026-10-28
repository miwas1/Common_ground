// Development only: submit disambiguation choices for a campaign's latest run over HTTP
// (same path as the form's server action). 404 in production.
import { resolveAndResume } from "@/lib/campaigns/runs";
import { getCampaignHeader } from "@/lib/views/campaign";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not found" }, { status: 404 });
  const { id } = await params;
  const { run } = await getCampaignHeader(id);
  if (!run) return Response.json({ error: "no run" }, { status: 404 });
  const { choices } = (await request.json()) as { choices: { referenceId: string; candidateId: string | null }[] };
  return Response.json(await resolveAndResume(run.id, choices));
}
