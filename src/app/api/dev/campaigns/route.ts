// Development only: create a campaign from form fields over HTTP (used to exercise the pipeline
// end to end without a browser). Same code path as the brief form's server action. 404 in production.
import { getActor } from "@/lib/auth/actor";
import { createCampaignFromForm } from "@/lib/campaigns/create";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not found" }, { status: 404 });
  const actor = await getActor();
  if (!actor) return Response.json({ error: "sign in required" }, { status: 401 });
  const campaignId = await createCampaignFromForm(actor, await request.formData());
  return Response.json({ campaignId });
}
