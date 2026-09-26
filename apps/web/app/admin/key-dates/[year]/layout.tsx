import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
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

async function loadYear(year: number) {
  try {
    return await loadAdminKeyDatesYear(year);
  } catch {
    return null;
  }
}

/**
 * The shell, section tabs and year picker for one calendar year. Sections
 * render as children, so moving between them only reloads the content.
 */
export default async function AdminKeyDatesYearLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ year: string }>;
}) {
  const year = calendarYearParam((await params).year);
  const [data, canManage] = await Promise.all([
    loadYear(year),
    canManageCatalogueOperations(),
  ]);
  const reviewDiff = data?.review
    ? diffUniversityCalendarReview(data.review.events, data.published)
    : null;

  return (
    <KeyDatesTabs year={year}>
      <AppShell
        admin
        fill
        tabs={
          <KeyDatesTabList
            pendingChanges={
              reviewDiff
                ? Math.max(reviewDiff.added + reviewDiff.removed, 1)
                : null
            }
          />
        }
      >
        <h1 className="sr-only">Key dates {year}</h1>
        <div className="workspace-stack w-full">
          <KeyDatesToolbar
            canManage={canManage}
            hasPublished={(data?.published.length ?? 0) > 0}
            hasReview={Boolean(data?.review)}
            sourceUrl={createUniversityCalendarUrl(year)}
            year={year}
            years={data?.years ?? [year]}
          />
          {data ? (
            children
          ) : (
            <Alert role="alert" variant="warning">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Key dates could not be loaded</AlertTitle>
              <AlertDescription>
                The calendar data for {year} is unavailable. Reload the page to
                try again.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </AppShell>
    </KeyDatesTabs>
  );
}
