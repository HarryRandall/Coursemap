"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

export default function SocietiesError({ reset }: { reset: () => void }) {
  return (
    <AppShell fill>
      <ErrorState
        title="Societies temporarily unavailable"
        description="The club directory and events could not be loaded. Please try again shortly."
      >
        <Button onClick={reset}>Try again</Button>
      </ErrorState>
    </AppShell>
  );
}
