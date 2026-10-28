import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getActor } from "@/lib/auth/actor";
import { getAuth } from "@/lib/auth/server";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { findShowcase } from "@/lib/demo/showcase";

// One link to the finished showcase campaign. Visitors without a session enter as the demo brand,
// so judges and readers of the README land on a complete result with no sign-in step.
export async function GET() {
  if (!(await getActor())) {
    const password = process.env.DEMO_PASSWORD;
    if (!password) redirect("/sign-in");
    const auth = await getAuth();
    await auth.api.signInEmail({ body: { email: DEMO_ACCOUNTS.brand.user.email, password }, headers: await headers() });
  }
  const showcase = await findShowcase(await getDb());
  redirect(showcase ? `/brand/campaigns/${showcase.id}` : "/brand");
}
