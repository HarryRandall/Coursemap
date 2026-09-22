import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import type { ReactNode } from "react";

/**
 * The shared furniture of an operations detail page. Syncs and discovery
 * checks answer the same kinds of question - what ran, against what, and what
 * came back - so they are read in the same shapes rather than each inventing
 * its own.
 */

/**
 * Diagnostics are read, not scanned: long fact grids and highlighted source
 * become unreadable when a wide screen stretches them edge to edge. Tables and
 * artefacts scroll inside this measure rather than widening past it.
 */
export function Measure({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4">
      {children}
    </div>
  );
}

export function OperationsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A flat set of recorded values, labelled and wrapped to the page. */
export function Facts({
  items,
}: {
  items: Array<{ label: string; value: string | null }>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm break-words">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
