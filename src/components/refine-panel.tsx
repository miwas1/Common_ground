import { refineAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getRefinable } from "@/lib/views/revisions";

const KIND_LABEL: Record<string, string> = { entity: "Name", tag: "Interest", audience: "Audience group" };

/** Challenge an input: each change makes a new revision and a full new run; the current one is kept. */
export async function RefinePanel({ campaignId, revisionId, budgetCents, currency }: { campaignId: string; revisionId: string; budgetCents: number | null; currency: string }) {
  const { references, inputs } = await getRefinable(revisionId);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Try a change</CardTitle>
        <CardDescription>
          Remove something from the brief or change the budget, and we&apos;ll redo the research as a new version. This version stays, so you can compare the two.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={refineAction.bind(null, campaignId)} className="grid gap-4 text-sm">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Names and interests from your brief</p>
            <ul className="flex flex-wrap gap-2">
              {references.map((r) => (
                <li key={r.id} className="flex items-center gap-1 rounded-full border bg-background py-0.5 pr-0.5 pl-3">
                  <span>{r.label}</span>
                  <span className="text-xs text-muted-foreground">· {KIND_LABEL[r.qlooKind]}</span>
                  <Button type="submit" name="change" value={`remove_reference:${r.id}`} variant="ghost" size="xs" aria-label={`Remove ${r.label} and rerun`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          {inputs.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">What you said about your audience</p>
              <ul className="grid gap-1.5">
                {inputs.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3">
                    <span>{i.text}</span>
                    <Button type="submit" name="change" value={`remove_input:${i.id}`} variant="ghost" size="xs" aria-label={`Remove “${i.text}” and rerun`}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Budget ({currency})</span>
              <Input name="budget" inputMode="decimal" defaultValue={budgetCents ? String(budgetCents / 100) : ""} className="w-36" />
            </label>
            <Button type="submit" name="change" value="set_budget" variant="outline" size="sm">Change budget</Button>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
