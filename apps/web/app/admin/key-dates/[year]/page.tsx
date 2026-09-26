import Link from "next/link";
import { ArrowRight, CircleAlert, Plus } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
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
import { keyDatesPath } from "@/lib/admin/key-dates-sections";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";
import { KeyDateDialog } from "@/ui/admin/key-dates/key-date-dialog";
import { KeyDatesMonthList } from "@/ui/admin/key-dates/key-dates-month-list";
import { KeyDatesSyncButton } from "@/ui/admin/key-dates/key-dates-sync-button";
import { CalendarIllustration } from "@/ui/key-dates/calendar-illustration";
import { KeyDatesLoadError } from "@/ui/admin/key-dates/key-dates-load-error";
import { calendarYearParam } from "./year-param";

export const dynamic = "force-dynamic";

export default async function AdminKeyDatesPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const year = calendarYearParam((await params).year);
  const [data, canManage] = await Promise.all([
    loadAdminKeyDatesYear(year).catch(() => null),
    canManageCatalogueOperations(),
  ]);
  if (!data) return <KeyDatesLoadError year={year} />;

  if (data.published.length === 0) {
    return (
      <Card className="flex-1 justify-center md:min-h-0">
        <Empty className="py-12 sm:py-16">
          <EmptyHeader className="max-w-md">
            <EmptyMedia>
              <CalendarIllustration />
            </EmptyMedia>
            <EmptyTitle>No key dates for {year} yet</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Sync the ANU calendar to review every date before students see it, or add dates yourself."
                : "An import administrator can sync and publish this year."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                {data.review ? (
                  <Button asChild>
                    <Link href={keyDatesPath(year, "sync")}>
                      Review the sync
                    </Link>
                  </Button>
                ) : (
                  <KeyDatesSyncButton year={year} />
                )}
                <KeyDateDialog
                  trigger={
                    <Button type="button" variant="outline">
                      <Plus aria-hidden="true" size={15} />
                      Add date
                    </Button>
                  }
                  year={year}
                />
              </div>
            </EmptyContent>
          ) : null}
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.review ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>A sync is waiting for review</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            Students keep seeing these dates until it is approved.
            <Link
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              href={keyDatesPath(year, "sync")}
            >
              Review the sync
              <ArrowRight aria-hidden="true" size={13} />
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <KeyDatesMonthList
        editable={canManage ? { year } : undefined}
        events={
          diffUniversityCalendarReview(data.published, data.published).events
        }
      />
    </div>
  );
}
