import { notFound } from "next/navigation";
import { CircleAlert, ExternalLink } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { buttonVariants } from "@coursemap/ui/primitives/button";
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
import { createUniversityCalendarUrl } from "@/lib/catalogue-import/anu-university-calendar";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";
import { KeyDatesHistory } from "@/ui/admin/key-dates/key-dates-history";
import { KeyDatesMonthList } from "@/ui/admin/key-dates/key-dates-month-list";
import { KeyDatesReviewPanel } from "@/ui/admin/key-dates/key-dates-review";
import { KeyDatesSyncButton } from "@/ui/admin/key-dates/key-dates-sync-button";
import { KeyDatesYearStrip } from "@/ui/admin/key-dates/key-dates-year-strip";
import { CalendarIllustration } from "@/ui/key-dates/calendar-illustration";
import { AppShell } from "@/ui/shell";

export const dynamic = "force-dynamic";

const publishedFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeZone: "Australia/Sydney",
});

async function loadYear(year: number) {
  try {
    return await loadAdminKeyDatesYear(year);
  } catch {
    return null;
  }
}

export default async function AdminKeyDatesYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: rawYear } = await params;
  const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > 2200) notFound();

  const [data, canManage] = await Promise.all([
    loadYear(year),
    canManageCatalogueOperations(),
  ]);
  const sourceUrl = createUniversityCalendarUrl(year);

  if (!data) {
    return (
      <AppShell admin>
        <h1 className="sr-only">Key dates {year}</h1>
        <Alert role="alert" variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Key dates could not be loaded</AlertTitle>
          <AlertDescription>
            The calendar data for {year} is unavailable. Reload the page to try
            again.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const summary = data.years.find((item) => item.year === year);
  const publishedCount = data.published.length;
  const publishedDiff = diffUniversityCalendarReview(
    data.published,
    data.published,
  );
  const reviewDiff = data.review
    ? diffUniversityCalendarReview(data.review.events, data.published)
    : null;

  return (
    <AppShell admin>
      <h1 className="sr-only">Key dates {year}</h1>
      <div className="w-full space-y-6">
        <KeyDatesYearStrip selectedYear={year} years={data.years} />

        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-semibold tracking-tight tabular-nums">
                {year}
              </h2>
              {data.review ? (
                <Badge variant="primary-light">Ready to review</Badge>
              ) : publishedCount > 0 ? (
                <Badge variant="success-light">Published</Badge>
              ) : (
                <Badge variant="outline">Not published</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {publishedCount > 0
                ? `${publishedCount} dates visible to students${
                    summary?.publishedAt
                      ? `, last published ${publishedFormat.format(new Date(summary.publishedAt))}`
                      : ""
                  }.`
                : "Students see no key dates for this year."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className={buttonVariants({ variant: "ghost" })}
              href={sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              ANU calendar
              <ExternalLink aria-hidden="true" size={14} />
            </a>
            {canManage && (data.review || publishedCount > 0) ? (
              <KeyDatesSyncButton
                label="Sync again"
                variant={data.review ? "outline" : "default"}
                year={year}
              />
            ) : null}
          </div>
        </Card>

        {data.review && reviewDiff ? (
          <KeyDatesReviewPanel
            canManage={canManage}
            diff={reviewDiff}
            review={data.review}
            year={year}
          />
        ) : publishedCount > 0 ? (
          <section aria-labelledby="key-dates-published" className="space-y-3">
            <h2 id="key-dates-published" className="text-sm font-semibold">
              Published dates
            </h2>
            <KeyDatesMonthList events={publishedDiff.events} />
          </section>
        ) : (
          <Card>
            <Empty className="py-12 sm:py-16">
              <EmptyHeader className="max-w-md">
                <EmptyMedia>
                  <CalendarIllustration />
                </EmptyMedia>
                <EmptyTitle>No key dates for {year} yet</EmptyTitle>
                <EmptyDescription>
                  {canManage
                    ? "Sync the ANU university calendar to preview every date. Nothing reaches students until you approve it."
                    : "An import administrator can sync and publish this year."}
                </EmptyDescription>
              </EmptyHeader>
              {canManage ? (
                <EmptyContent>
                  <KeyDatesSyncButton year={year} />
                </EmptyContent>
              ) : null}
            </Empty>
          </Card>
        )}

        <KeyDatesHistory runs={data.history} />
      </div>
    </AppShell>
  );
}
