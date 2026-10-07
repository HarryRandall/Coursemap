import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { cn } from "@/lib/cn";

/**
 * One headline figure: label, value and a short detail on the left, one small
 * visual on the right. Every tile in a row uses this shape so the row reads
 * as a set, whatever the visual is.
 */
export function KpiTile({
  label,
  value,
  change,
  detail,
  visual,
  href,
}: {
  label: string;
  value: ReactNode;
  /** A short signed movement shown beside the value, such as "+22". */
  change?: string;
  detail: string;
  visual?: ReactNode;
  href?: string;
}) {
  const body = (
    <Card
      className={cn(
        "h-full flex-row items-center justify-between gap-4 px-4 py-3.5",
        href && "transition hover:border-input hover:bg-accent/40",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
            {value}
          </span>
          {change ? (
            <span className="text-xs font-medium text-success tabular-nums">
              {change}
            </span>
          ) : null}
        </p>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {detail}
        </p>
      </div>
      {visual ? (
        <div className="flex h-12 w-28 shrink-0 items-center justify-end">
          {visual}
        </div>
      ) : null}
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

/** The tile's placeholder, the same size and layout as a loaded tile. */
export function KpiTileSkeleton({ visual = true }: { visual?: boolean }) {
  return (
    <Card className="h-full flex-row items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2.5 h-6 w-16" />
        <Skeleton className="mt-2.5 h-3 w-28" />
      </div>
      {visual ? <Skeleton className="h-12 w-28 shrink-0" /> : null}
    </Card>
  );
}
