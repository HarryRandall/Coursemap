"use client";

import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

export function CatalogueOperationsError({
  error,
  reset,
}: {
  error?: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell
      admin
      fill
      breadcrumbSegmentLabels={{ operations: null }}
      currentBreadcrumbLabel="Catalogue"
    >
      <ErrorState
        code={error?.digest ? "500 · Server error" : undefined}
        title="We couldn't load catalogue activity"
        description="The catalogue sync and discovery history could not be loaded. Try again, or return to the admin overview."
        reference={error?.digest}
      >
        <Button onClick={reset} type="button">
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/dashboard">Back to overview</Link>
        </Button>
      </ErrorState>
    </AppShell>
  );
}
