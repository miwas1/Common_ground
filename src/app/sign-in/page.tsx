import Link from "next/link";
import { signInAsDemo, signInWithEmail } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="text-sm font-medium text-primary">Common Ground</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Try the demo</CardTitle>
          <CardDescription>A real brand account with a fictional brand and creator roster.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <form action={signInAsDemo}>
            <Button type="submit" className="w-full">Enter as Juniper Coffee (demo brand)</Button>
          </form>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <ActionForm action={signInWithEmail} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" variant="secondary">Sign in with email</Button>
      </ActionForm>
    </main>
  );
}
