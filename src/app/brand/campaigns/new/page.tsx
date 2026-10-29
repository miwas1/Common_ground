import { Suspense } from "react";
import { createCampaign } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { actingBrandOrg } from "@/lib/auth/brand";
import { pageActor } from "@/lib/auth/page";
import { FACT_KIND_LABEL } from "@/lib/brand/extract";
import { approvedFacts } from "@/lib/brand/profile";
import { EXAMPLE_BRIEF as EXAMPLE } from "@/lib/demo/example-brief";
import { SOURCE_LABEL } from "@/lib/views/labels";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";


const SOURCES = Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }));

async function NewCampaignForm() {
  const actor = await pageActor();
  const org = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  const profile = org ? (await approvedFacts(await getDb(), org)).filter((f) => ["research", "measured", "belief", "avoid", "approved_claim"].includes(f.kind)) : [];
  return (
    <ActionForm action={createCampaign} className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]" errorClassName="lg:col-span-2">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1 · Your goal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Campaign name" name="name" defaultValue={EXAMPLE.name} />
            <div className="grid gap-1.5">
              <Label htmlFor="objective">What do you want this campaign to do?</Label>
              <Textarea id="objective" name="objective" defaultValue={EXAMPLE.objective} rows={2} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="campaignType">What do you need from creators?</Label>
              <select id="campaignType" name="campaignType" defaultValue="ugc_production" className={SELECT}>
                <option value="ugc_production">Content for your own channels</option>
                <option value="creator_distribution">Posts on the creators&apos; own accounts</option>
                <option value="hybrid">Both</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2 · Product and audience</CardTitle>
            <CardDescription>For each thing you know about your audience, say where it comes from.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand" name="brandName" defaultValue={EXAMPLE.brandName} required />
              <Field label="Product" name="productName" defaultValue={EXAMPLE.productName} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="productDescription">Product description</Label>
              <Textarea id="productDescription" name="productDescription" defaultValue={EXAMPLE.productDescription} rows={2} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Your audience</legend>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_200px]">
                  <Input name={`audience_${i}`} aria-label={`Audience note ${i + 1}`} defaultValue={EXAMPLE.audience[i]?.text ?? ""} placeholder="e.g. Most buyers are new parents" />
                  <select name={`audience_source_${i}`} aria-label={`Where audience note ${i + 1} comes from`} defaultValue={EXAMPLE.audience[i]?.source ?? "team"} className={SELECT}>
                    {SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </fieldset>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">What your customers love</Label>
              <Textarea id="notes" name="notes" defaultValue={EXAMPLE.notes} rows={3} />
              <p className="text-xs text-muted-foreground">Name brands, artists, shows, podcasts or books your customers like. If a name could mean more than one thing, we&apos;ll ask.</p>
            </div>
          </CardContent>
        </Card>

        {profile.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>From your brand profile</CardTitle>
              <CardDescription>Ticked statements join this brief with their source. Rules to avoid are added to the brief&apos;s constraints.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {profile.slice(0, 12).map((f) => (
                  <li key={f.id}>
                    <label className="flex items-start gap-2.5 text-sm">
                      <input type="checkbox" name="profile_fact" value={f.id} defaultChecked className="mt-1" />
                      <span>
                        <span className="mr-1.5 text-xs font-medium text-muted-foreground">{FACT_KIND_LABEL[f.kind]}</span>
                        {f.text}
                        {f.documentName && <span className="block text-xs text-muted-foreground">{f.documentName}{f.page ? `, p. ${f.page}` : ""}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>3 · The content</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="What you need made" name="deliverables" defaultValue={EXAMPLE.deliverables} />
            <Field label="Anything to avoid" name="constraints" defaultValue={EXAMPLE.constraints} />
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>4 · Budget and markets</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <Field label="Budget" name="budget" defaultValue="12000" inputMode="decimal" />
              <div className="grid gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select id="currency" name="currency" defaultValue="USD" className={SELECT}>
                  <option>USD</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </div>
            </div>
            <fieldset className="grid gap-2 text-sm">
              <legend className="mb-1 font-medium">Markets</legend>
              {[
                ["US", "United States"],
                ["GB", "United Kingdom"],
                ["DE", "Germany"],
              ].map(([code, name]) => (
                <label key={code} className="flex items-center gap-2">
                  <input type="checkbox" name={`market_${code}`} defaultChecked={code === "US"} /> {name}
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>
        <Button type="submit" size="lg">Start research</Button>
        <p className="text-xs text-muted-foreground">
          This takes a few minutes. You can leave the page and come back.
        </p>
      </div>
    </ActionForm>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ve filled in an example. Change anything, or run it as it is.</p>
      <Suspense>
        <NewCampaignForm />
      </Suspense>
    </AppShell>
  );
}
