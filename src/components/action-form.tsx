"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import { cn } from "@/lib/utils";

/** A form whose server action can return `{ error }`; the message is shown at the top of the form. */
export function ActionForm({
  action,
  className,
  errorClassName,
  children,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  className?: string;
  errorClassName?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && (
        <p role="alert" className={cn("rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive", errorClassName)}>
          {state.error}
        </p>
      )}
      {children}
    </form>
  );
}
