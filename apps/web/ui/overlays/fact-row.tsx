import type { ReactNode } from "react";

/** One labelled line in the course dialog's facts list. */
export function FactRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="pt-0.5 text-xs text-muted-foreground sm:text-[13px]">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
