"use client";
import { useSearchParams } from "next/navigation";
import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { PublicRecordLoading } from "@/ui/catalogue/public-record-loading";
import {
  CourseDetailTabsList,
  courseTabFromSearch,
  type CourseTab,
} from "@/ui/courses/course-detail-view";

/** A titled card standing in for one full-width section. */
function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="min-w-0 gap-0 p-0">
      <div className="space-y-2 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="divide-y divide-border/60 border-t border-border/60">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="space-y-3 px-5 py-4">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

const bodyForTab: Partial<Record<CourseTab, React.ReactNode>> = {
  requisites: (
    <Card className="min-w-0 gap-5 p-5">
      <Skeleton className="h-4 w-52" />
      <Skeleton className="h-64 w-full" />
    </Card>
  ),
  offerings: <SectionSkeleton rows={3} />,
  "student-review": <SectionSkeleton rows={2} />,
};

/**
 * The course page while it loads, shaped like the tab being opened so the
 * active tab and the layout below it stay put when the page lands.
 */
export function CourseDetailLoading() {
  const tab = courseTabFromSearch(useSearchParams()?.get("tab") ?? null);
  return (
    <Tabs value={tab} className="gap-0">
      <PublicRecordLoading
        label="course"
        tabs={<CourseDetailTabsList disabled />}
      >
        {bodyForTab[tab]}
      </PublicRecordLoading>
    </Tabs>
  );
}
