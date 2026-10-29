// Download a proposal brief as Markdown. Same authorization as the proposal page: hidden campaigns are 404.
import { getDb } from "@/db";
import { getActor } from "@/lib/auth/actor";
import { authorize, AuthorizationError } from "@/lib/auth/authorize";
import { briefFilename, briefToMarkdown } from "@/lib/briefs/markdown";
import { getProposalBrief } from "@/lib/views/brief";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  const actor = await getActor();
  if (!actor) return new Response("Sign in required", { status: 401 });
  try {
    await authorize(await getDb(), actor, { type: "campaign.read", campaignId: id });
  } catch (err) {
    if (err instanceof AuthorizationError) return new Response("Not found", { status: 404 });
    throw err;
  }
  const doc = await getProposalBrief(id, pid);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(briefToMarkdown(doc), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${briefFilename(doc)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
