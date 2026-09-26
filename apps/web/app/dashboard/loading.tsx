import type { ReactNode } from "react";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";
import { AcademicMetricCard } from "@/ui/dashboard/academic-metric-card";
import {
  averageMarkSkeleton,
  coverageSkeleton,
  gpaSkeleton,
  gradesSkeleton,
  keyDatesSkeleton,
  tuitionSkeleton,
  upcomingLoadSkeleton,
} from "@/ui/dashboard/metric-skeletons";

/** A metric card that pulses the outline of the chart it will show. */
function LoadingMetric({ skeleton }: { skeleton: ReactNode }) {
  return (
    <AcademicMetricCard
      header={<Skeleton className="h-4 w-20" />}
      empty={{ label: "", skeleton }}
    />
  );
}

/** The dashboard's layout in outline, so nothing moves when it loads. */
export default function DashboardLoading() {
  return (
    <AppShell loading>
      <div aria-busy="true" className="flex min-w-0 flex-col gap-6">
        <span className="sr-only">Loading dashboard</span>

        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            gpaSkeleton,
            gradesSkeleton,
            tuitionSkeleton,
            averageMarkSkeleton,
          ].map((skeleton, index) => (
            <LoadingMetric key={index} skeleton={skeleton} />
          ))}
        </div>

        <Card className="animate-pulse py-0">
          <CardContent className="flex items-center gap-6 p-5">
            <div className="grid size-28 shrink-0 place-items-center rounded-full border-[7px] border-muted">
              <div className="size-[76px] rounded-full border-[7px] border-muted" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <Skeleton className="h-8 w-56 max-w-full" />
              <Skeleton className="h-2.5 w-full rounded-full" />
              <div className="flex flex-wrap gap-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-3 w-24" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid animate-pulse items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Card className="py-0">
            <CardContent className="flex h-full flex-col gap-4 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              {/* The largest section on the left, the rest stacked beside it. */}
              <div className="grid min-h-52 flex-1 grid-cols-[1.4fr_1fr] gap-1.5">
                <Skeleton className="rounded-lg" />
                <div className="grid grid-rows-[1.6fr_1fr] gap-1.5">
                  <Skeleton className="rounded-lg" />
                  <Skeleton className="rounded-lg" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="flex h-full flex-col gap-3 p-4">
              <Skeleton className="h-4 w-32" />
              <div className="grid flex-1 grid-cols-7 place-items-center gap-y-3">
                {Array.from({ length: 35 }, (_, index) => (
                  <Skeleton key={index} className="size-5 rounded-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[keyDatesSkeleton, coverageSkeleton, upcomingLoadSkeleton].map(
            (skeleton, index) => (
              <LoadingMetric key={index} skeleton={skeleton} />
            ),
          )}
        </div>

        <Card className="animate-pulse py-0">
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-56" />
            </div>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
