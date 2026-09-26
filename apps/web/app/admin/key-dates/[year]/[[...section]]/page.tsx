import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CircleAlert, ExternalLink, Plus } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button, buttonVariants } from "@coursemap/ui/primitives/button";
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
import {
  KEY_DATES_SECTIONS,
  keyDatesPath,
  type KeyDatesSection,
} from "@/lib/admin/key-dates-sections";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { createUniversityCalendarUrl } from "@/lib/catalogue-import/anu-university-calendar";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";
import { KeyDateDialog } from "@/ui/admin/key-dates/key-date-dialog";
import { KeyDatesChangelog } from "@/ui/admin/key-dates/key-dates-changelog";
import { KeyDatesPublishedList } from "@/ui/admin/key-dates/key-dates-published-list";
import { KeyDatesReviewPanel } from "@/ui/admin/key-dates/key-dates-review";
import { KeyDatesSyncButton } from "@/ui/admin/key-dates/key-dates-sync-button";
import {
  KeyDatesTabList,
  KeyDatesTabs,
} from "@/ui/admin/key-dates/key-dates-tabs";
import { KeyDatesToolbar } from "@/ui/admin/key-dates/key-dates-toolbar";
import { CalendarIllustration } from "@/ui/key-dates/calendar-illustration";
import { AppShell } from "@/ui/shell";

export const dynamic = "force-dynamic";

const dayFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeZone: "Australia/Sydney",
});

const SECTION_LABELS: Record<KeyDatesSection, string> = {
  dates: "Dates",
  sync: "Sync",
  changelog: "Changelog",
};

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
  params: Promise<{ year: string; section?: string[] }>;
}) {
  const { year: rawYear, section: segments = [] } = await params;
  const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > 2200) notFound();
  if (segments.length > 1) notFound();
  const section = (segments[0] ?? "dates") as KeyDatesSection;
  if (!KEY_DATES_SECTIONS.includes(section) || segments[0] === "dates")
    notFound();

  const [data, canManage] = await Promise.all([
    loadYear(year),
    canManageCatalogueOperations(),
  ]);
  const sourceUrl = createUniversityCalendarUrl(year);
  const reviewDiff = data?.review
    ? diffUniversityCalendarReview(data.review.events, data.published)
    : null;
  const pendingChanges = reviewDiff
    ? Math.max(reviewDiff.added + reviewDiff.removed, 1)
    : null;

  const shellProps = {
    admin: true,
    breadcrumbTrailingIcon:
      section === "dates" ? ("key-dates" as const) : undefined,
    breadcrumbTrailingLabel: section === "dates" ? "Dates" : undefined,
    tabs: <KeyDatesTabList pendingChanges={pendingChanges} />,
  };

  if (!data) {
    return (
      <KeyDatesTabs section={section} year={year}>
        <AppShell {...shellProps}>
          <h1 className="sr-only">Key dates {year}</h1>
          <Alert role="alert" variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Key dates could not be loaded</AlertTitle>
            <AlertDescription>
              The calendar data for {year} is unavailable. Reload the page to
              try again.
            </AlertDescription>
          </Alert>
        </AppShell>
      </KeyDatesTabs>
    );
  }

  const publishedCount = data.published.length;
  const status = data.review ? (
    <Badge variant="primary-light">Sync ready to review</Badge>
  ) : publishedCount > 0 ? (
    <span>
      <span className="font-medium text-foreground tabular-nums">
        {publishedCount}
      </span>{" "}
      dates published
      {data.publishedAt
        ? ` · last synced ${dayFormat.format(new Date(data.publishedAt))}`
        : ""}
    </span>
  ) : (
    <span>Nothing published for {year}</span>
  );
  const sourceLink = (
    <a
      className={buttonVariants({ variant: "ghost" })}
      href={sourceUrl}
      rel="noreferrer"
      target="_blank"
    >
      ANU calendar
      <ExternalLink aria-hidden="true" size={14} />
    </a>
  );
  const addButton = canManage ? (
    <KeyDateDialog
      trigger={
        <Button type="button" variant="outline">
          <Plus aria-hidden="true" size={15} />
          Add date
        </Button>
      }
      year={year}
    />
  ) : null;
  const actions =
    section === "dates" ? (
      <>
        {sourceLink}
        {publishedCount > 0 ? addButton : null}
      </>
    ) : section === "sync" ? (
      <>
        {sourceLink}
        {canManage && data.review ? (
          <KeyDatesSyncButton
            label="Sync again"
            variant="outline"
            year={year}
          />
        ) : null}
      </>
    ) : null;

  return (
    <KeyDatesTabs section={section} year={year}>
      <AppShell {...shellProps}>
        <h1 className="sr-only">
          Key dates {year}: {SECTION_LABELS[section]}
        </h1>
        <div className="w-full space-y-5">
          <KeyDatesToolbar
            actions={actions}
            section={section}
            status={status}
            year={year}
            years={data.years}
          />

          {section === "dates" ? (
            <>
              {data.review ? (
                <Alert variant="info">
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>A sync is waiting for review</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    Students keep seeing the dates below until it is approved.
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
              {publishedCount > 0 ? (
                <KeyDatesPublishedList
                  canManage={canManage}
                  events={
                    diffUniversityCalendarReview(data.published, data.published)
                      .events
                  }
                  year={year}
                />
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
                          ? "Sync the ANU university calendar to preview every date before students see it, or add dates by hand."
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
                          {addButton}
                        </div>
                      </EmptyContent>
                    ) : null}
                  </Empty>
                </Card>
              )}
            </>
          ) : null}

          {section === "sync" ? (
            data.review && reviewDiff ? (
              <KeyDatesReviewPanel
                canManage={canManage}
                diff={reviewDiff}
                review={data.review}
                year={year}
              />
            ) : (
              <Card>
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
                      A sync reads the ANU university calendar and shows what
                      would change. Nothing reaches students until you approve
                      it, and dates entered by hand are kept.
                    </EmptyDescription>
                  </EmptyHeader>
                  {canManage ? (
                    <EmptyContent>
                      <KeyDatesSyncButton year={year} />
                    </EmptyContent>
                  ) : null}
                </Empty>
              </Card>
            )
          ) : null}

          {section === "changelog" ? (
            <KeyDatesChangelog entries={data.changelog} year={year} />
          ) : null}
        </div>
      </AppShell>
    </KeyDatesTabs>
  );
}
