import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { cn } from "@/lib/cn";

/**
 * The frame for the dashboard's academic cards: a title row, a chart and an
 * optional footer. The title row holds only the title and one figure, badge
 * or link, and the title truncates first, so the two never collide however
 * narrow the card is. Until there is data, the card shows a muted outline of
 * its own chart and states why in the title row, so the row keeps its shape
 * and each card still reads as the graph it will become.
 */
export function AcademicMetricCard({
  title,
  aside,
  footer,
  empty,
  children,
}: {
  /** Omitted while loading, which shows a placeholder bar instead. */
  title?: string;
  /** The headline figure, badge or link at the end of the title row. */
  aside?: ReactNode;
  /** Context and period controls under the chart, hidden while empty. */
  footer?: ReactNode;
  /** Why the card is empty and the chart outline to show meanwhile. */
  empty?: { label: string; skeleton: ReactNode } | null;
  children?: ReactNode;
}) {
  return (
    <Card className="min-w-0 py-0">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-h-7 items-center gap-2">
          {title === undefined ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
          )}
          {empty ? (
            <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
              {empty.label}
            </span>
          ) : null}
          {aside ? (
            <div
              className={cn("flex shrink-0 items-center", !empty && "ml-auto")}
            >
              {aside}
            </div>
          ) : null}
        </div>
        {/* Cards in a row stretch to the tallest, so a fixed-height chart
            sits centred in any spare height. */}
        <div className="flex flex-1 flex-col justify-center">
          {empty ? (
            <div className="h-24" aria-hidden="true">
              {empty.skeleton}
            </div>
          ) : (
            children
          )}
        </div>
        {footer && !empty ? (
          <div className="flex min-h-6 items-center gap-2">{footer}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Arrows that step a card through its periods, right-aligned in the footer.
 * A direction with nothing further has no handler and is disabled.
 */
export function MetricPager({
  label,
  earlierLabel,
  laterLabel,
  onEarlier,
  onLater,
}: {
  /** The period shown, when the chart does not already name it. */
  label?: string;
  earlierLabel: string;
  laterLabel: string;
  onEarlier?: () => void;
  onLater?: () => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={earlierLabel}
        disabled={!onEarlier}
        onClick={onEarlier}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </Button>
      {label ? (
        <span
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {label}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={laterLabel}
        disabled={!onLater}
        onClick={onLater}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
