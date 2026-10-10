import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@coursemap/ui/lib/utils";
import {
  type CourseSurveyResults,
  OVERALL_THEME,
  latestSurvey,
  sessionMedians,
  surveyLabel,
  themeSummaries,
} from "@/lib/course-surveys/survey-results";
import { ReviewOverallSparkline } from "@/ui/courses/reviews/review-overall-sparkline";
import { ReviewRangeBar } from "@/ui/courses/reviews/review-range-bar";
import { ReviewResponseColumns } from "@/ui/courses/reviews/review-response-columns";
import { ReviewSessionComparison } from "@/ui/courses/reviews/review-session-comparison";
import { ReviewThemeColumns } from "@/ui/courses/reviews/review-theme-columns";
import { ShareRing } from "@/ui/common/share-ring";

export function ReviewSummaryCards({
  results,
}: {
  results: CourseSurveyResults;
}) {
  const latest = latestSurvey(results);
  const summaries = themeSummaries(results);
  const overall = summaries.find((summary) => summary.key === OVERALL_THEME);
  if (!latest || !overall) return null;
  const themes = summaries.filter((summary) => summary.key !== OVERALL_THEME);
  const strongest = themes.reduce((best, summary) =>
    summary.latest > best.latest ? summary : best,
  );
  const change = Math.round(overall.latest - overall.median);
  const sessions = sessionMedians(results);
  const responseRate = Math.round(
    (latest.respondents / latest.enrolments) * 100,
  );

  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label={`Overall, ${surveyLabel(latest)}`}
        value={`${overall.latest}%`}
        aside={<ChangeFromMedian change={change} />}
        chart={<ReviewOverallSparkline results={results} />}
      />
      <SummaryCard
        label="Usual overall"
        value={`${Math.round(overall.median)}%`}
        chart={
          sessions ? (
            <ReviewSessionComparison
              sem1={sessions.sem1}
              sem2={sessions.sem2}
            />
          ) : (
            <ReviewRangeBar
              min={overall.min}
              max={overall.max}
              median={overall.median}
            />
          )
        }
      />
      <SummaryCard
        label="Strongest theme"
        value={`${strongest.latest}%`}
        aside={
          <span className="truncate text-xs text-muted-foreground">
            {strongest.shortLabel}
          </span>
        }
        chart={
          <ReviewThemeColumns
            summaries={summaries}
            highlightKey={strongest.key}
          />
        }
      />
      <SummaryCard
        label="Responses"
        value={`${latest.respondents}`}
        aside={
          <span className="text-xs text-muted-foreground">
            of {latest.enrolments}
          </span>
        }
        corner={
          <ShareRing
            size={48}
            thickness={5}
            values={[{ share: responseRate / 100, tone: "primary" }]}
            centre={`${responseRate}%`}
            label={`${responseRate}% response rate`}
          />
        }
        chart={<ReviewResponseColumns results={results} />}
      />
    </dl>
  );
}

function SummaryCard({
  label,
  value,
  aside,
  chart,
  corner,
}: {
  label: string;
  value: string;
  aside?: ReactNode;
  chart: ReactNode;
  /** Shown beside the label and value, top right. */
  corner?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </span>
            {aside}
          </div>
        </div>
        {corner ? <div className="shrink-0">{corner}</div> : null}
      </dd>
      <dd className="mt-3">{chart}</dd>
    </div>
  );
}

function ChangeFromMedian({ change }: { change: number }) {
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone =
    change > 0
      ? "text-success"
      : change < 0
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-medium", tone)}>
      <Icon size={14} aria-hidden="true" />
      {change === 0
        ? "Usual"
        : `${change > 0 ? "+" : "-"}${Math.abs(change)} vs usual`}
    </span>
  );
}
