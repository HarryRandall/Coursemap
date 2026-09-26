import type { ReactNode } from "react";
import { Card, CardContent } from "@coursemap/ui/primitives/card";

/**
 * The frame for the dashboard's academic cards: a heading row and a chart.
 * Until there is data, the card shows a muted outline of its own chart and
 * states why in the heading row, so the row keeps its shape and each card
 * still reads as the graph it will become.
 */
export function AcademicMetricCard({
  header,
  empty,
  children,
}: {
  header: ReactNode;
  /** Why the card is empty and the chart outline to show meanwhile. */
  empty?: { label: string; skeleton: ReactNode } | null;
  children?: ReactNode;
}) {
  return (
    <Card className="min-w-0 py-0">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-h-7 items-center justify-between gap-2">
          {header}
          {empty ? (
            <span className="text-xs text-muted-foreground">{empty.label}</span>
          ) : null}
        </div>
        {empty ? (
          <div className="h-24" aria-hidden="true">
            {empty.skeleton}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
