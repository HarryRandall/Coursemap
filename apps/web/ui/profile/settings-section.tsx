import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A titled group of settings: each row puts what a setting is on the left and
 * its control on the right, collapsing to one column on narrow screens.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  labelId,
  children,
  className,
}: {
  label: string;
  description?: ReactNode;
  /** The control's id, for a label that focuses it. */
  htmlFor?: string;
  /** An id for the label, for controls that are labelled by reference. */
  labelId?: string;
  children: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div
      className={cn(
        "grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-8",
        className,
      )}
    >
      <div className="min-w-0">
        <Label
          id={labelId}
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-foreground"
        >
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {/* Controls sit at the row's right edge; fields still fill it. */}
      <div className="flex min-w-0 flex-col items-stretch gap-1.5 self-center sm:items-end [&>input]:w-full">
        {children}
      </div>
    </div>
  );
}
