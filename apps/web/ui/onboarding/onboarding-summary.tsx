import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type OnboardingSummaryRow = {
  label: string;
  value: ReactNode;
};

/** The answers so far. Rows without a value show a dash, so the shape of the plan is visible from the start. */
export function OnboardingSummary({
  className,
  rows,
}: {
  className?: string;
  rows: readonly OnboardingSummaryRow[];
}) {
  return (
    <section
      aria-label="Your plan so far"
      className={cn(
        "rounded-2xl border bg-card/80 p-5 backdrop-blur-sm",
        className,
      )}
    >
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Your plan
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="font-medium break-words">
              {row.value || <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
