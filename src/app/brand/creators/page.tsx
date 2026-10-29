import { AtSign, Check, CircleSlash, FileUp, Plus, RefreshCw, Star, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { actingBrandOrg } from "@/lib/auth/brand";
import { pageActor } from "@/lib/auth/page";
import { formatMoney } from "@/lib/pipeline/money";
import { audienceLean, describeLean, occupationLabel, type QlooPersonProfile } from "@/lib/roster/qloo";
import { getRoster, type RosterProvenance } from "@/lib/roster/roster";
import { eq } from "drizzle-orm";
import {
  addCreatorAction,
  excludeAction,
  importCsvAction,
  includeAction,
  rematchAction,
  removeAction,
  saveNotesAction,
  setAvailabilityAction,
  setPreferredAction,
  setRateAction,
} from "./actions";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso?: string) => (iso ? date.format(new Date(iso)) : null);
const AVAILABILITY: Record<string, string> = { available: "Available", limited: "Limited availability", booked: "Fully booked" };
const COUNTRY: Record<string, string> = { US: "United States", GB: "United Kingdom", DE: "Germany" };

const TEMPLATE = [
  "name,instagram,city,country,rate,currency,package,usage,availability,email,manager,notes,preferred",
  "Claire Saffitz,csaffitz,New York,US,,USD,,,available,,,Pastry; met at a trade show,yes",
  "Sam Rivera,samcooks,Austin,US,1800,USD,1 vertical video + 3 hooks,12 months paid social,limited,sam@example.com,,,",
].join("\n");

async function Roster({ searchParams }: { searchParams: Promise<{ imported?: string }> }) {
  const actor = await pageActor();
  const org = await actingBrandOrg(actor.userId, actor.activeOrganizationId);
  const db = await getDb();
  if (!org) return <p className="text-sm text-muted-foreground">Your account needs a brand workspace first.</p>;
  const [{ imported }, roster, [o]] = await Promise.all([
    searchParams,
    getRoster(db, org),
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, org)),
  ]);
  const entries = roster.entries;
  const own = entries.filter((e) => !e.creator.isDemo);
  const demo = entries.filter((e) => e.creator.isDemo);
  const inQloo = entries.filter((e) => e.creator.qlooPersonId).length;
  const quoteRequired = entries.filter((e) => e.quotes.length === 0).length;
  const preferred = entries.filter((e) => e.link?.preferred).length;

  return (
    <div className="grid gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          {o?.name && <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{o.name}</p>}
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Creators</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            The people you can commission. Each one is checked against Qloo: whether it knows them, and who their audience is.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="#import">
              <FileUp className="size-4" /> Import CSV
            </a>
          </Button>
          <Button asChild>
            <a href="#add">
              <Plus className="size-4" /> Add creator
            </a>
          </Button>
        </div>
      </header>

      {imported && (
        <p role="status" className="rounded-xl border border-success/25 bg-success-soft/60 px-4 py-3 text-sm">
          <span className="font-medium">Import finished:</span> {imported}.
        </p>
      )}

      {roster.usesDemo && (
        <div className="rounded-2xl border bg-card p-5 text-sm">
          <p className="font-medium">
            {roster.ownCount === 0 ? "Your roster is empty, so campaigns use the demo roster." : "This is a demo workspace, so campaigns use your creators and the demo roster."}
          </p>
          <p className="mt-1 text-muted-foreground">
            Demo creators are made up. Import the creators you work with, or open a campaign direction and add the real creators Qloo found for it.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-4">
        <Stat label="On your roster" value={entries.length} />
        <Stat label="Known to Qloo" value={inQloo} />
        <Stat label="Quote required" value={quoteRequired} />
        <Stat label="Preferred" value={preferred} />
      </dl>

      <section className="grid gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Your creators</h2>
        {own.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-sm">
            <p className="font-display text-2xl">No creators of your own yet</p>
            <p className="max-w-lg text-muted-foreground">
              Add the people you work with, import a spreadsheet, or open a campaign direction and add the real creators Qloo found for it.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {own.map((e) => (
              <CreatorRow key={e.creator.id} e={e} />
            ))}
          </ul>
        )}
      </section>

      <section id="add" className="scroll-mt-20 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="font-display text-2xl">Add a creator</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only the name is required. With an Instagram handle, we look them up in Qloo.</p>
          <ActionForm action={addCreatorAction} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" required />
              <Field label="Instagram handle" name="instagram" placeholder="@handle" />
              <Field label="City" name="city" />
              <div className="grid gap-1.5">
                <Label htmlFor="country">Country</Label>
                <select id="country" name="country" defaultValue="" className={SELECT}>
                  <option value="">Not recorded</option>
                  {Object.entries(COUNTRY).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
              <Field label="Rate" name="rate" placeholder="Leave empty if you still need a quote" />
              <div className="grid gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <select id="currency" name="currency" defaultValue="USD" className={SELECT}>
                  <option>USD</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What the rate covers" name="package" placeholder="e.g. 1 vertical video + 3 hooks" />
              <Field label="Usage rights" name="usage" placeholder="e.g. 12 months paid social" />
              <div className="grid gap-1.5">
                <Label htmlFor="availability">Availability</Label>
                <select id="availability" name="availability" defaultValue="" className={SELECT}>
                  <option value="">Not checked</option>
                  <option value="available">Available</option>
                  <option value="limited">Limited</option>
                  <option value="booked">Fully booked</option>
                </select>
              </div>
              <Field label="Portfolio link" name="portfolio" placeholder="https://" />
              <Field label="Email" name="email" type="email" />
              <Field label="Manager or agency" name="manager" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} placeholder="Past work with you, things to know" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="preferred" /> Preferred creator
            </label>
            <Button type="submit" className="justify-self-start">
              <UserPlus className="size-4" /> Add creator
            </Button>
          </ActionForm>
        </div>

        <div id="import" className="scroll-mt-20 rounded-2xl border bg-card p-6">
          <h2 className="font-display text-2xl">Import a CSV</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One creator per row. Column names are flexible: <span className="font-medium text-foreground">name</span> is required; instagram, city, country,
            rate, currency, package, usage, availability, email, manager, notes and preferred are optional. Creators with no rate stay on the roster as
            &ldquo;Quote required&rdquo;.
          </p>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="creator-roster-template.csv"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Download a template
          </a>
          <ActionForm action={importCsvAction} className="mt-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="file">CSV file</Label>
              <Input id="file" name="file" type="file" accept=".csv,text/csv" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="csv">Or paste the rows</Label>
              <Textarea id="csv" name="csv" rows={6} placeholder={TEMPLATE} className="font-mono text-xs" />
            </div>
            <Button type="submit" className="justify-self-start">
              <FileUp className="size-4" /> Import creators
            </Button>
          </ActionForm>
        </div>
      </section>

      {demo.length > 0 && (
        <details className="group rounded-2xl border bg-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4">
            <span>
              <span className="font-medium">Demo roster</span>
              <span className="text-sm text-muted-foreground"> · {demo.length} made-up creators{roster.usesDemo ? ", used for casting in this workspace" : ""}</span>
            </span>
            <span className="text-sm text-primary group-open:hidden">Show</span>
            <span className="hidden text-sm text-primary group-open:inline">Hide</span>
          </summary>
          <ul className="grid gap-3 border-t p-4">
            {demo.map((e) => (
              <CreatorRow key={e.creator.id} e={e} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type Entry = Awaited<ReturnType<typeof getRoster>>["entries"][number];

function CreatorRow({ e }: { e: Entry }) {
  const c = e.creator;
  const handles = c.handles as { instagram?: string };
  const known = c.qlooPersonId ? (c.qlooProfile as QlooPersonProfile) : null;
  const checked = (c.qlooProfile as { checkedAt?: string } | null)?.checkedAt;
  const prov = (e.link?.provenance ?? {}) as RosterProvenance;
  const availability = c.availability as { status?: string; checkedAt?: string };
  const rate = e.quotes[0];
  const place = [c.city, c.country ? (COUNTRY[c.country] ?? c.country) : ""].filter(Boolean).join(", ");
  return (
    <li className={`rounded-2xl border bg-card p-5 ${e.link?.excluded ? "opacity-70" : ""}`}>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1.3fr_1fr_auto] lg:items-start">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-hidden>
            {c.displayName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {c.displayName}
              {e.link?.preferred && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                  <Star className="size-3" /> Preferred
                </span>
              )}
              {c.isDemo && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Demo, made up</span>}
            </p>
            <p className="text-sm text-muted-foreground">
              {handles.instagram && (
                <a href={`https://www.instagram.com/${handles.instagram}/`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-foreground">
                  <AtSign className="size-3" />
                  {handles.instagram}
                </a>
              )}
              {handles.instagram && place ? " · " : ""}
              {place}
            </p>
            {e.link?.excluded && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <CircleSlash className="size-3.5" /> Excluded{e.link.exclusionReason ? `: ${e.link.exclusionReason}` : ""}
              </p>
            )}
            {e.link?.notes && <p className="mt-1 text-xs text-muted-foreground">{e.link.notes}</p>}
          </div>
        </div>

        <div className="text-sm">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-info uppercase">Qloo</p>
          {known ? (
            <>
              <p className="mt-0.5">{known.occupations.slice(0, 3).map(occupationLabel).join(" · ") || "Public figure"}</p>
              <p className="text-muted-foreground">Audience: {describeLean(audienceLean(known.audience))}</p>
              <p className="text-xs text-muted-foreground">
                {known.matchedVia === "name" ? "Matched by name: check it's them" : known.matchedVia === "instagram" ? "Matched by Instagram handle" : "Suggested by Qloo"}
                {prov.audience ? ` · ${when(prov.audience.at)}` : ""}
              </p>
            </>
          ) : c.isDemo ? (
            <p className="mt-0.5 text-muted-foreground">Fictional: matched through the references in their profile.</p>
          ) : (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-muted-foreground">
              {checked ? "Not found in Qloo." : "Not checked yet."}
              <form action={rematchAction.bind(null, c.id)}>
                <Button type="submit" size="sm" variant="ghost" className="h-7 px-2">
                  <RefreshCw className="size-3.5" /> Check again
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="text-sm">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Rate</p>
          {rate ? (
            <>
              <p className="mt-0.5 font-medium">{formatMoney(rate.amountCents, rate.currency)} <span className="font-normal text-muted-foreground">· {rate.package}</span></p>
              <p className="text-xs text-muted-foreground">{rate.suppliedBy ? `From ${rate.suppliedBy}` : c.isDemo ? "Demo rate card" : "Rate card"}{prov.rate ? ` · ${when(prov.rate.at)}` : ""}</p>
            </>
          ) : (
            <p className="mt-0.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Quote required</p>
          )}
          <p className="mt-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Availability</p>
          <p className="mt-0.5 text-sm">
            {availability.status ? AVAILABILITY[availability.status] ?? availability.status : "Not checked"}
            {availability.checkedAt && <span className="text-xs text-muted-foreground"> · checked {when(availability.checkedAt)}{prov.availability ? ` by ${prov.availability.by}` : ""}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-1.5 lg:flex-col lg:items-end">
          {!e.link?.excluded && (
            <form action={setPreferredAction.bind(null, c.id, !e.link?.preferred)}>
              <Button type="submit" size="sm" variant="outline">
                <Star className="size-3.5" /> {e.link?.preferred ? "Unmark preferred" : "Mark preferred"}
              </Button>
            </form>
          )}
          {e.link?.excluded ? (
            <form action={includeAction.bind(null, c.id)}>
              <Button type="submit" size="sm" variant="outline">
                <Check className="size-3.5" /> Include again
              </Button>
            </form>
          ) : (
            <details className="group">
              <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">Exclude…</summary>
              <form action={excludeAction.bind(null, c.id)} className="mt-2 grid w-64 gap-2">
                <Input name="reason" placeholder="Why? e.g. brand conflict" />
                <Button type="submit" size="sm" variant="destructive">Exclude from casting</Button>
              </form>
            </details>
          )}
          {e.ownedByBrand && (
            <details className="group">
              <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">Edit…</summary>
              <div className="mt-2 grid w-72 gap-3 rounded-xl border bg-background p-3">
                <ActionForm action={setRateAction.bind(null, c.id)} className="grid gap-2">
                  <div className="grid grid-cols-[1fr_80px] gap-2">
                    <Input name="rate" placeholder="Rate, e.g. 1500" />
                    <select name="currency" defaultValue={rate?.currency ?? "USD"} className={SELECT}>
                      <option>USD</option>
                      <option>GBP</option>
                      <option>EUR</option>
                    </select>
                  </div>
                  <Input name="package" placeholder="What it covers" />
                  <Input name="usage" placeholder="Usage rights" />
                  <Button type="submit" size="sm" variant="outline">Save rate</Button>
                </ActionForm>
                <form action={setAvailabilityAction.bind(null, c.id)} className="grid grid-cols-[1fr_auto] gap-2">
                  <select name="availability" defaultValue={availability.status ?? "available"} className={SELECT}>
                    <option value="available">Available</option>
                    <option value="limited">Limited</option>
                    <option value="booked">Fully booked</option>
                  </select>
                  <Button type="submit" size="sm" variant="outline">Save</Button>
                </form>
                <form action={saveNotesAction.bind(null, c.id)} className="grid gap-2">
                  <Textarea name="notes" rows={2} defaultValue={e.link?.notes ?? ""} placeholder="Notes" />
                  <Button type="submit" size="sm" variant="outline">Save notes</Button>
                </form>
                <form action={removeAction.bind(null, c.id)}>
                  <Button type="submit" size="sm" variant="ghost" className="text-destructive">Remove from roster</Button>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-4xl leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function Field({ label, name, ...rest }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...rest} />
    </div>
  );
}

export default function CreatorsPage({ searchParams }: { searchParams: Promise<{ imported?: string }> }) {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Roster searchParams={searchParams} />
      </Suspense>
      <p className="mt-10 text-xs text-muted-foreground">
        Qloo lookups send only a public handle or name. Audience details are Qloo&apos;s aggregate affinities for the people who like a creator, not data about
        individuals. <Link href="/about/qloo" className="underline underline-offset-2">How we use Qloo</Link>
      </p>
    </AppShell>
  );
}
