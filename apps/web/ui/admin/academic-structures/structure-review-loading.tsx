"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";
import { TabsLoading } from "@/ui/common/tabs-loading";
import { cn } from "@/lib/cn";

/**
 * Mirrors the programme, major, minor and specialisation review page: a
 * section tab bar, a four-cell fact strip and a definition list of fields.
 * The raw public id is hidden from the breadcrumb until the record name loads.
 */
export function StructureReviewLoading({ noun }: { noun: string }) {
  const { id, year } = useParams<{ id: string; year?: string }>();

  return (
    <AppShell
      loading
      admin
      breadcrumbSegmentLabels={{
        [id]: null,
        ...(year ? { [year]: null } : {}),
      }}
      tabs={<TabsLoading widths={["w-14", "w-24", "w-14"]} />}
    >
      <div aria-busy="true" className="mx-auto w-full min-w-0 space-y-4 pb-10">
        <span className="sr-only">Loading {noun}</span>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className={cn(
                  "space-y-2.5 px-4 py-3.5 sm:px-5",
                  index > 0 && "border-l border-border",
                )}
              >
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
          <div className="px-5 sm:px-6">
            {[
              ["w-12", "w-3/4"],
              ["w-10", "w-24"],
              ["w-10", "w-16"],
              ["w-20", "w-full"],
            ].map(([labelWidth, valueWidth], index) => (
              <div
                key={index}
                className="grid gap-2 border-b border-border/60 py-4 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-5"
              >
                <Skeleton className={cn("h-3", labelWidth)} />
                <div className="space-y-2">
                  <Skeleton className={cn("h-3", valueWidth)} />
                  {index === 3 ? <Skeleton className="h-3 w-2/3" /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
