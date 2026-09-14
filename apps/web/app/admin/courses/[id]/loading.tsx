"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { TabsLoading } from "@/ui/common/tabs-loading";
import { AppShell } from "@/ui/shell";
import styles from "@/ui/admin/courses/course-workspace.module.css";

export default function AdminCourseDetailLoading() {
  const { year } = useParams<{ year: string }>();
  return (
    <AppShell
      loading
      admin
      fill
      fullBleed
      breadcrumbSegmentLabels={{ [year]: null }}
      tabs={<TabsLoading widths={["w-16", "w-20", "w-20"]} />}
    >
      <div className={styles.layout} aria-busy="true">
        <span className="sr-only">Loading course review</span>
        <div className={styles.sidebar}>
          <div className="space-y-3">
            {Array.from({ length: 14 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className={styles.content}>
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
