"use client";

import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

export function CatalogueError({
  error,
  reset,
}: {
  error?: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell admin fill>
      <ErrorState
        code={error?.digest ? "500 · Server error" : undefined}
        title="We couldn't load this list"
        description="The catalogue data could not be loaded. Try again, or return to the admin overview."
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

const LIST_LABELS = Object.fromEntries(
  Object.values(CATALOGUE_KIND_LABELS).map((labels) => [
    labels.segment,
    labels.plural.toLowerCase(),
  ]),
);

/**
 * One record failed, not the list. The way out is the list it came from, which
 * is the segment above it, so the reader is not sent back to the overview to
 * find their place again.
 */
export function CatalogueRecordError({
  error,
  reset,
}: {
  error?: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[2] ?? "";
  const listPath = `/admin/${segment}`;
  const listLabel = LIST_LABELS[segment] ?? "catalogue";
  return (
    <AppShell admin fill>
      <ErrorState
        code={error?.digest ? "500 · Server error" : undefined}
        title="We couldn't load this record"
        description={`The record's snapshots, reviews and history could not be loaded. Try again, or go back to the ${listLabel}.`}
        reference={error?.digest}
      >
        <Button onClick={reset} type="button">
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href={listPath}>Back to {listLabel}</Link>
        </Button>
      </ErrorState>
    </AppShell>
  );
}
