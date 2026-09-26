import { Card } from "@coursemap/ui/primitives/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { loadAdminKeyDatesYear } from "@/lib/admin/key-dates";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";
import { KeyDatesReviewPanel } from "@/ui/admin/key-dates/key-dates-review";
import { KeyDatesSyncButton } from "@/ui/admin/key-dates/key-dates-sync-button";
import { CalendarIllustration } from "@/ui/key-dates/calendar-illustration";
import { calendarYearParam } from "../year-param";

export const dynamic = "force-dynamic";

const dayFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeZone: "Australia/Sydney",
});

export default async function AdminKeyDatesSyncPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const year = calendarYearParam((await params).year);
  const [data, canManage] = await Promise.all([
    loadAdminKeyDatesYear(year).catch(() => null),
    canManageCatalogueOperations(),
  ]);
  if (!data) return null;

  if (data.review) {
    return (
      <div className="workspace-scroll">
        <KeyDatesReviewPanel
          canManage={canManage}
          diff={diffUniversityCalendarReview(
            data.review.events,
            data.published,
          )}
          review={data.review}
          year={year}
        />
      </div>
    );
  }

  return (
    <div className="workspace-scroll flex flex-col">
      <Card className="flex-1 justify-center">
        <Empty className="py-12 sm:py-16">
          <EmptyHeader className="max-w-md">
            <EmptyMedia>
              <CalendarIllustration />
            </EmptyMedia>
            <EmptyTitle>
              {data.publishedAt
                ? `Last synced ${dayFormat.format(new Date(data.publishedAt))}`
                : `${year} has not been synced`}
            </EmptyTitle>
            <EmptyDescription>
              Nothing reaches students until you approve the sync, and dates you
              entered yourself are kept.
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <KeyDatesSyncButton year={year} />
            </EmptyContent>
          ) : null}
        </Empty>
      </Card>
    </div>
  );
}
