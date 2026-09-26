import { Suspense, type ReactNode } from "react";
import { loadAdminKeyDatesYear } from "@/lib/admin/key-dates";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { createUniversityCalendarUrl } from "@/lib/catalogue-import/anu-university-calendar";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";
import {
  KeyDatesTabList,
  KeyDatesTabs,
} from "@/ui/admin/key-dates/key-dates-tabs";
import { KeyDatesToolbar } from "@/ui/admin/key-dates/key-dates-toolbar";
import { AppShell } from "@/ui/shell";
import { calendarYearParam } from "./year-param";

async function PendingTabList({ year }: { year: number }) {
  const data = await loadAdminKeyDatesYear(year).catch(() => null);
  const diff = data?.review
    ? diffUniversityCalendarReview(data.review.events, data.published)
    : null;
  return (
    <KeyDatesTabList
      pendingChanges={diff ? Math.max(diff.added + diff.removed, 1) : null}
    />
  );
}

async function LoadedToolbar({ year }: { year: number }) {
  const [data, canManage] = await Promise.all([
    loadAdminKeyDatesYear(year).catch(() => null),
    canManageCatalogueOperations(),
  ]);
  return (
    <KeyDatesToolbar
      canManage={canManage}
      hasPublished={(data?.published.length ?? 0) > 0}
      hasReview={Boolean(data?.review)}
      sourceUrl={createUniversityCalendarUrl(year)}
      year={year}
      years={data?.years ?? [year]}
    />
  );
}

/**
 * The shell, section tabs and year picker for one calendar year. Nothing
 * here waits for the year's data: the tab badge and the toolbar's actions
 * stream in behind fallbacks drawn the same way, so changing year or
 * section only replaces the content below.
 */
export default async function AdminKeyDatesYearLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ year: string }>;
}) {
  const year = calendarYearParam((await params).year);
  const toolbarFallback = (
    <KeyDatesToolbar
      canManage={false}
      hasPublished={false}
      hasReview={false}
      sourceUrl={createUniversityCalendarUrl(year)}
      year={year}
      years={[year]}
    />
  );

  return (
    <KeyDatesTabs year={year}>
      <AppShell
        admin
        fill
        tabs={
          <Suspense fallback={<KeyDatesTabList pendingChanges={null} />}>
            <PendingTabList year={year} />
          </Suspense>
        }
      >
        <h1 className="sr-only">Key dates {year}</h1>
        <div className="workspace-stack w-full">
          <div className="workspace-scroll flex flex-col gap-4">
            <Suspense fallback={toolbarFallback}>
              <LoadedToolbar year={year} />
            </Suspense>
            {children}
          </div>
        </div>
      </AppShell>
    </KeyDatesTabs>
  );
}
