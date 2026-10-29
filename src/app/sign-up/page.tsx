import Link from "next/link";
import { signInAsDemo, signUpWithEmail } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="text-sm font-medium text-primary">Common Ground</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your brand workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Research runs on real Qloo data and casts from the shared demo roster of fictional creators.
      </p>

      <ActionForm action={signUpWithEmail} className="mt-6 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="brand">Brand or team</Label>
          <Input id="brand" name="brand" autoComplete="organization" placeholder="e.g. Juniper Coffee" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button type="submit" className="mt-1">Create account</Button>
      </ActionForm>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">Sign in</Link>
      </p>

      <Separator className="my-6" />

      <form action={signInAsDemo}>
        <Button type="submit" variant="outline" className="w-full">Or skip sign-up: enter the demo brand</Button>
      </form>
    </main>
  );
}
