"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where "Save as PDF" produces a shareable file. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
