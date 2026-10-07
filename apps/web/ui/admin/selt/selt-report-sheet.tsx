"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, ExternalLink } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@coursemap/ui/primitives/sheet";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import type { SeltAdminReportDetail } from "@/lib/selt/admin";
import { seltReportChecks } from "@/lib/selt/admin-format";
import { completeSurveyResults } from "@/lib/course-surveys/report-model";
import { SURVEY_THEMES } from "@/lib/course-surveys/survey-results";
import { cn } from "@/lib/cn";
import { ReviewTrendChart } from "@/ui/courses/reviews/review-trend-chart";
import { SeltStatusBadge } from "@/ui/admin/selt/selt-status-badge";
import { formatCanberraDate } from "@/lib/canberra-format";

function Value({
  value,
  suffix = "",
}: {
  value: number | null;
  suffix?: string;
}) {
  return value === null ? (
    <span className="text-muted-foreground">
      <span aria-hidden="true">–</span>
      <span className="sr-only">Unavailable</span>
    </span>
  ) : (
    <>
      {value}
      {suffix}
    </>
  );
}

/** One report's values, checks and publication, opened from the table. */
export function SeltReportSheet({
  report,
  closeHref,
  canPublish,
}: {
  report: SeltAdminReportDetail;
  closeHref: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const checks = seltReportChecks(report.surveys, report.warnings);
  const results = completeSurveyResults({
    courseCode: report.code,
    sourceName: report.sourceName ?? "ANU",
    sourceUrl: report.sourceUrl,
    reportRunAt: report.reportRunAt,
    notes: report.notes,
    surveys: report.surveys.map((survey) => ({
      year: survey.year,
      session: survey.session,
      enrolments: survey.enrolments,
      respondents: survey.respondents,
      responseRatePercent: survey.response_rate_percent,
      agreementPercent: Object.fromEntries(
        SURVEY_THEMES.map((theme) => [theme.key, survey[theme.key]]),
      ) as Record<(typeof SURVEY_THEMES)[number]["key"], number | null>,
    })),
  });

  async function publish() {
    setPublishing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/selt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", id: report.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Publishing failed.",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref)}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {report.code}
            </span>
            <SeltStatusBadge status={report.status} />
          </div>
          <SheetTitle className="text-lg">{report.courseName}</SheetTitle>
          <SheetDescription>
            Uploaded {formatCanberraDate(report.createdAt)} ·{" "}
            {report.surveys.length} semesters · parser {report.parserVersion}
            {report.replacesPublished && report.status !== "published"
              ? " · replaces the published report"
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {report.warnings.length ? (
            <Alert variant="destructive">
              <AlertTitle>Publication is blocked</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <section aria-labelledby="selt-checks" className="space-y-2">
            <h3 id="selt-checks" className="text-sm font-semibold">
              Checks
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {checks.map((check) => {
                const Icon = check.passed ? CircleCheck : CircleX;
                return (
                  <li
                    key={check.label}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px]"
                  >
                    <Icon
                      size={16}
                      className={cn(
                        "shrink-0",
                        check.passed ? "text-success" : "text-destructive",
                      )}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {check.passed ? "Passed:" : "Failed:"}
                    </span>
                    {check.label}
                  </li>
                );
              })}
            </ul>
          </section>

          {results.surveys.length > 1 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">As students will see it</h3>
              <ReviewTrendChart results={results} />
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Extracted values</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-right text-xs tabular-nums">
                <caption className="sr-only">
                  Extracted survey values by semester
                </caption>
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Semester
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Responses
                    </th>
                    {SURVEY_THEMES.map((theme) => (
                      <th
                        scope="col"
                        key={theme.key}
                        className="px-2 py-2 font-medium"
                      >
                        {theme.shortLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.surveys.map((survey) => (
                    <tr key={survey.label} className="border-t border-border">
                      <th
                        scope="row"
                        className="px-2 py-1.5 text-left font-normal whitespace-nowrap"
                      >
                        {survey.label}
                      </th>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Value value={survey.respondents} />
                        <span className="text-muted-foreground">
                          {" "}
                          / <Value value={survey.enrolments} />
                        </span>
                      </td>
                      {SURVEY_THEMES.map((theme) => (
                        <td key={theme.key} className="px-2 py-1.5">
                          <Value value={survey[theme.key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button asChild variant="outline">
            <a href={report.sourceUrl} target="_blank" rel="noreferrer">
              Original ANU report
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          {canPublish && report.status === "ready" ? (
            <Button disabled={publishing} onClick={() => void publish()}>
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
