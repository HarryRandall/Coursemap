"use client";

import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
} from "@/lib/coursemap/catalogue-kinds";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

/**
 * Shown when a published catalogue record cannot be read, both from the page
 * itself and from its route boundary.
 */
export function PublicRecordError({
  kind,
  onRetry,
  retryHref,
}: {
  kind: CatalogueKind;
  onRetry?: () => void;
  retryHref?: string;
}) {
  const labels = CATALOGUE_KIND_LABELS[kind];
  return (
    <AppShell>
      <ErrorState
        title={`This ${labels.singular.toLowerCase()} could not be loaded`}
        description="The published catalogue did not answer. Nothing you have saved has changed. Please try again shortly."
      >
        {onRetry ? (
          <Button onClick={onRetry} type="button">
            Try again
          </Button>
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
