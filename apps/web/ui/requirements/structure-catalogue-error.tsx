"use client";

import Link from "next/link";
import { Button } from "@coursemap/ui/primitives/button";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

/** Shown when a published structure cannot be read, on the page and from the boundary. */
export function StructureCatalogueError({
  retryHref,
  onRetry,
}: {
  retryHref?: string;
  onRetry?: () => void;
}) {
  return (
    <AppShell fill breadcrumbSegmentLabels={{ structures: null }}>
      <ErrorState
        title="This programme could not be loaded"
        description="The published catalogue did not answer. Nothing you have saved has changed. Please try again shortly."
      >
        {onRetry ? (
          <Button onClick={onRetry}>Try again</Button>
        ) : retryHref ? (
          <Button asChild>
            <Link href={retryHref}>Try again</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </ErrorState>
    </AppShell>
  );
}
