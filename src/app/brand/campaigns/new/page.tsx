import { Suspense } from "react";
import { createCampaign } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pageActor } from "@/lib/auth/page";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

// The example brief (fictional brand; real public references) so a first run takes one click.
const EXAMPLE = {
  name: "Summer cold brew launch",
  brandName: "Juniper Coffee",
  productName: "Cold Brew Concentrate",
  productDescription: "A coffee concentrate for making iced coffee and coffee desserts at home in under a minute.",
  objective: "Launch in the US with original creator-made videos for paid social; learn which creative world to scale.",
  notes:
    "Customer interviews: people who buy specialty coffee like Blue Bottle Coffee and Stumptown Coffee Roasters, listen to Khruangbin, and watch The Bear. Our team believes they cook and host at home.",
  deliverables: "3 vertical videos with 6 opening hooks; paid usage for 12 months",
  constraints: "No alcohol pairings. No claims about caffeine or health.",
  audience: [
    { text: "Customers mention Khruangbin and The Bear in interviews", source: "research" },
    { text: "They enjoy home cooking and hosting friends", source: "assumption" },
    { text: "Specialty coffee drinkers in their late twenties and thirties", source: "team" },
  ],
};

const SOURCES = [
  { value: "research", label: "From customer research" },
  { value: "team", label: "Provided by your team" },
  { value: "assumption", label: "Suggested assumption" },
];

async function NewCampaignForm() {
  await pageActor();
  return (
    <form action={createCampaign} className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1 · Goal and campaign type</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Campaign name" name="name" defaultValue={EXAMPLE.name} />
            <div className="grid gap-1.5">
              <Label htmlFor="objective">Objective</Label>
              <Textarea id="objective" name="objective" defaultValue={EXAMPLE.objective} rows={2} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="campaignType">What you are buying</Label>
              <select id="campaignType" name="campaignType" defaultValue="ugc_production" className={SELECT}>
                <option value="ugc_production">Paid UGC: creators produce content for your channels</option>
                <option value="creator_distribution">Distribution: creators publish to their followers</option>
                <option value="hybrid">Hybrid: production and distribution</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2 · Product and audience</CardTitle>
            <CardDescription>Label where each audience statement comes from. Assumptions stay visible as assumptions.</CardDescription>
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
              <legend className="mb-1 text-sm font-medium">Audience inputs</legend>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_200px]">
                  <Input name={`audience_${i}`} aria-label={`Audience input ${i + 1}`} defaultValue={EXAMPLE.audience[i]?.text ?? ""} placeholder="e.g. Most buyers are new parents" />
                  <select name={`audience_source_${i}`} aria-label={`Source of audience input ${i + 1}`} defaultValue={EXAMPLE.audience[i]?.source ?? "team"} className={SELECT}>
                    {SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </fieldset>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Research and references</Label>
              <Textarea id="notes" name="notes" defaultValue={EXAMPLE.notes} rows={3} />
              <p className="text-xs text-muted-foreground">Name public brands, artists, shows, podcasts or books your customers care about. The agent matches them to Qloo and asks when a name is ambiguous.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3 · Creative requirements</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Deliverables" name="deliverables" defaultValue={EXAMPLE.deliverables} />
            <Field label="Constraints" name="constraints" defaultValue={EXAMPLE.constraints} />
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
              <Field label="Production budget" name="budget" defaultValue="12000" inputMode="decimal" />
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
          The research runs in the background and keeps going if you leave this page. Qloo results describe aggregate affinities, not individual people.
        </p>
      </div>
    </form>
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
    <AppShell area="brand">
      <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      <p className="mt-1 text-sm text-muted-foreground">The example brief is filled in. Change anything, or run it as it is.</p>
      <Suspense>
        <NewCampaignForm />
      </Suspense>
    </AppShell>
  );
}
