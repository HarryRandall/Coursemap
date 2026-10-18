"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { workloadHoursLabel } from "@/lib/academic/workload";
import {
  coursePrice,
  coursePrices,
  DEFAULT_FEE_STATUS,
  feeStatusShortLabel,
} from "@/lib/academic/fee-status";
import { feeEstimateNote } from "@/lib/academic/fee-estimates";
import { useCoursemap } from "@/app/providers";
import type { Course } from "@/lib/coursemap/types";
import type { CourseDetailsState } from "@/lib/coursemap/use-course-details";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AssessmentWeights } from "@/ui/courses/assessment-weights";

const OUTCOMES_SHOWN = 3;
const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/**
 * What a course is, for the course dialog: its introduction, the plan's own
 * facts and requisites passed in as children, then assessment, outcomes and
 * the practical details. The summary course fills in until the published
 * details load, and assessment keeps its space meanwhile.
 */
export function CourseAbout({
  course,
  details,
  children,
}: {
  course: Course;
  details: CourseDetailsState;
  children: ReactNode;
}) {
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showAllOutcomes, setShowAllOutcomes] = useState(false);
  const { state } = useCoursemap();
  const full = details.details;
  const feeStatus = state.profile.feeStatus ?? DEFAULT_FEE_STATUS;
  // The full course carries every published price; the summary may not.
  const price = coursePrice({
    prices: full ? coursePrices(full.fees, full.feeEstimates) : course.prices,
    units: course.units,
    feeStatus,
    commencementYear: state.profile.commencementYear ?? null,
  });

  const description = [
    full?.introduction,
    full?.description ?? course.description,
  ]
    .filter(Boolean)
    .join("\n\n");
  const workload = full
    ? workloadHoursLabel(full.workloadHours, full.workloadHoursBasis)
    : null;
  const outcomes = full?.learningOutcomes ?? [];
  const footnote = [
    workload,
    course.delivery,
    full?.school ?? course.school,
    course.convener ? `Convener ${course.convener}` : "",
    price === null
      ? ""
      : price.estimate
        ? `≈ ${AUD.format(price.amount)} ${feeStatusShortLabel(feeStatus)}, estimated`
        : `${AUD.format(price.amount)} ${feeStatusShortLabel(feeStatus)}`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <section>
        <p
          className={cn(
            "text-[13px] leading-relaxed whitespace-pre-line text-foreground/85",
            !showFullDescription && "line-clamp-4",
          )}
        >
          {description || "No course description is available yet."}
        </p>
        {description.length > 280 ? (
          <button
            type="button"
            className="mt-1.5 cursor-pointer text-xs font-medium text-primary"
            onClick={() => setShowFullDescription((open) => !open)}
          >
            {showFullDescription ? "Show less" : "Read more"}
          </button>
        ) : null}
      </section>

      {children}

      {details.status === "loading" ? (
        <section aria-busy="true" aria-label="Loading assessment">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-2 w-full rounded-full" />
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-3.5 w-3/5" />
            ))}
          </div>
        </section>
      ) : full && full.assessments.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold text-foreground">Assessment</h3>
          <div className="mt-2">
            <AssessmentWeights assessments={full.assessments} />
          </div>
        </section>
      ) : null}

      {outcomes.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold text-foreground">
            You&apos;ll learn to
          </h3>
          <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {(showAllOutcomes
              ? outcomes
              : outcomes.slice(0, OUTCOMES_SHOWN)
            ).map((outcome) => (
              <li key={outcome.position} className="flex gap-2">
                <span className="w-4 shrink-0 text-right text-[11px] leading-5 text-muted-foreground/70 tabular-nums">
                  {outcome.position}
                </span>
                <span>{outcome.body}</span>
              </li>
            ))}
          </ol>
          {outcomes.length > OUTCOMES_SHOWN ? (
            <button
              type="button"
              className="mt-1.5 ml-6 cursor-pointer text-xs font-medium text-primary"
              onClick={() => setShowAllOutcomes((open) => !open)}
            >
              {showAllOutcomes
                ? "Show fewer"
                : `Show all ${outcomes.length} outcomes`}
            </button>
          ) : null}
        </section>
      ) : null}

      {footnote.length > 0 ? (
        <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p>{footnote.join(" · ")}</p>
          {price?.estimate ? <p>{feeEstimateNote(price.estimate)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
