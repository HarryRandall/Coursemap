"use client";

import { useMemo } from "react";
import { useCoursemap } from "@/app/providers";
import { DegreeProgressHero } from "@/ui/dashboard/degree-progress-hero";
import {
  buildMetricViews,
  MetricCardView,
  type MetricCourse,
} from "@/ui/dashboard/metric-cards";
import { MonthCalendar } from "@/ui/dashboard/month-calendar";
import { PlanEmptyState } from "@/ui/dashboard/plan-empty-state";
import { PlanDetailPanel } from "@/ui/dashboard/plan-detail-panel";
import type { PlanCourseRow } from "@/ui/dashboard/plan-course-table";
import {
  UniversityMetricsPreview,
  PlanningMetricsPreview,
} from "@/ui/dashboard/university-metrics-preview";
import { DegreeComposition } from "@/ui/dashboard/degree-composition";
import { AppShell } from "@/ui/shell";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import {
  cumulativeDashboardUnits,
  currentDashboardTermId,
  dashboardCalendarEvents,
  dashboardTermLoads,
  type DashboardTermPoint,
} from "@/lib/coursemap/dashboard-series";
import {
  academicSummary,
  academicTermPoints,
  gradeDistribution,
  tuitionEstimate,
  type CourseFeeLookup,
} from "@/lib/coursemap/academic-metrics";
import { planRisks } from "@/lib/coursemap/plan-risks";
import { requirementBucketProgress } from "@/lib/coursemap/requirement-progress";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import type { Term } from "@/lib/coursemap/types";
import {
  degreeUnitProgress,
  effectiveStatus,
  planningCourseForAttempt,
  statusLabel,
  unitsForAttempt,
} from "@/lib/planner";

const NO_COURSE_FEES: CourseFeeLookup = new Map();

function finishLabelFor(
  termLoads: readonly DashboardTermPoint[],
  terms: readonly Term[],
) {
  const last = [...termLoads].reverse().find((load) => load.units > 0);
  if (!last) return null;
  const term = terms.find((item) => item.id === last.id);
  if (term?.endsOn) {
    const date = new Date(`${term.endsOn}T00:00:00`);
    return date.toLocaleDateString("en-AU", {
      month: "short",
      year: "numeric",
    });
  }
  const suffix = last.id.split("-").at(-1);
  if (suffix === "s1") return `Jun ${last.year}`;
  if (suffix === "s2") return `Nov ${last.year}`;
  return `${term?.name ?? last.label} ${last.year}`;
}

export function Dashboard({ catalogue }: { catalogue: PlanCatalogue }) {
  const { state } = useCoursemap();
  const previewMetrics = process.env.NODE_ENV === "development";
  const degree = catalogue.degrees.find(
    (item) => item.code === state.profile.degreeCode,
  );
  const timelineYears = useMemo(
    () =>
      planTimelineYears({
        degree,
        commencementYear: state.profile.commencementYear,
        extensionYears: state.profile.extensionYears,
      }),
    [degree, state.profile.commencementYear, state.profile.extensionYears],
  );
  const timelineTerms = useMemo(
    () =>
      planTimelineTerms({
        terms: catalogue.terms,
        years: timelineYears,
      }),
    [catalogue.terms, timelineYears],
  );
  const planningCatalogue = useMemo(
    () => ({ ...catalogue, terms: timelineTerms }),
    [catalogue, timelineTerms],
  );
  const unitTarget = degree?.units ?? null;
  const progress = degreeUnitProgress(
    state.attempts,
    unitTarget ?? 0,
    planningCatalogue,
  );
  const planned = useMemo(
    () =>
      state.attempts
        .map((attempt) => ({
          attempt,
          course: planningCourseForAttempt(attempt, planningCatalogue),
          term: timelineTerms.find((term) => term.id === attempt.termId),
        }))
        .filter(
          (
            item,
          ): item is {
            attempt: (typeof state.attempts)[number];
            course: NonNullable<ReturnType<typeof planningCourseForAttempt>>;
            term: (typeof timelineTerms)[number] | undefined;
          } => Boolean(item.course),
        ),
    [planningCatalogue, state, timelineTerms],
  );
  const enrolledUnits = planned
    .filter((item) => item.attempt.status === "enrolled")
    .reduce(
      (total, item) => total + unitsForAttempt(item.attempt, item.course),
      0,
    );
  const termLoads = useMemo(
    () =>
      dashboardTermLoads({ ...planningCatalogue, attempts: state.attempts }),
    [planningCatalogue, state.attempts],
  );
  const cumulativeUnits = useMemo(
    () => cumulativeDashboardUnits(termLoads),
    [termLoads],
  );
  const calendarEvents = useMemo(
    () =>
      dashboardCalendarEvents({
        ...planningCatalogue,
        attempts: state.attempts,
      }),
    [planningCatalogue, state.attempts],
  );
  const currentTermId = useMemo(
    () => currentDashboardTermId(timelineTerms),
    [timelineTerms],
  );
  const buckets = useMemo(
    () =>
      requirementBucketProgress({
        requirements: catalogue.structureRequirements,
        attempts: state.attempts,
        catalogue: planningCatalogue,
      }),
    [catalogue.structureRequirements, planningCatalogue, state.attempts],
  );

  const academicInputs = useMemo(
    () => ({ ...planningCatalogue, attempts: state.attempts }),
    [planningCatalogue, state.attempts],
  );
  const academic = useMemo(
    () => academicSummary(academicInputs),
    [academicInputs],
  );
  const markTrend = useMemo(
    () => academicTermPoints(academicInputs),
    [academicInputs],
  );
  const grades = useMemo(
    () => gradeDistribution(academicInputs),
    [academicInputs],
  );
  // Fees live on CourseDetails, which the plan catalogue does not carry, so the
  // estimate stays empty until fee data is loaded alongside the plan.
  const tuition = useMemo(
    () => tuitionEstimate({ ...academicInputs, fees: NO_COURSE_FEES }),
    [academicInputs],
  );

  const planCourseRows = useMemo<PlanCourseRow[]>(() => {
    const termName = new Map(
      timelineTerms.map((term) => [term.id, term.shortName]),
    );
    return planned
      .map(({ attempt, course }) => {
        const status = effectiveStatus(attempt, state.attempts, catalogue);
        return {
          code: course.code,
          name: course.name,
          units: unitsForAttempt(attempt, course),
          termLabel: termName.get(attempt.termId) ?? "Unscheduled",
          grade: attempt.resultCode ?? attempt.mark?.toString() ?? "—",
          status,
          statusLabel: statusLabel(status),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [catalogue, planned, state.attempts, timelineTerms]);

  const risks = useMemo(
    () =>
      planRisks({
        buckets,
        attempts: state.attempts,
        catalogue: planningCatalogue,
        progress,
      }),
    [buckets, planningCatalogue, progress, state.attempts],
  );

  const metricViews = useMemo(() => {
    const coursesInTerm = (termId: string | undefined): MetricCourse[] =>
      termId
        ? planned
            .filter((item) => item.attempt.termId === termId)
            .map((item) => ({
              code: item.course.code,
              units: unitsForAttempt(item.attempt, item.course),
              ready: !["blocked", "approval"].includes(
                effectiveStatus(
                  item.attempt,
                  state.attempts,
                  planningCatalogue,
                ),
              ),
            }))
        : [];

    const currentIndex = termLoads.findIndex(
      (load) => load.id === currentTermId,
    );
    const firstPlannedIndex = termLoads.findIndex((load) => load.planned > 0);
    const focusIndex = currentIndex >= 0 ? currentIndex : firstPlannedIndex;
    const focus = focusIndex >= 0 ? termLoads[focusIndex] : undefined;
    const upcoming = focusIndex >= 0 ? termLoads.slice(focusIndex) : [];
    // Between semesters the focus already is the next one to start.
    const next =
      currentIndex >= 0
        ? upcoming.slice(1).find((load) => load.units > 0)
        : focus;

    return buildMetricViews({
      unitTarget,
      progress,
      enrolledUnits,
      cumulative: cumulativeUnits,
      buckets,
      focusTermLabel: focus?.label ?? null,
      focusCourses: coursesInTerm(focus?.id),
      nextTermLabel: next?.label ?? null,
      nextCourses: coursesInTerm(next?.id),
      upcoming,
      finishLabel: finishLabelFor(termLoads, timelineTerms),
      academic,
      markTrend,
      grades,
      tuition,
    });
  }, [
    academic,
    buckets,
    grades,
    markTrend,
    tuition,
    cumulativeUnits,
    currentTermId,
    enrolledUnits,
    planned,
    planningCatalogue,
    progress,
    state.attempts,
    termLoads,
    timelineTerms,
    unitTarget,
  ]);

  if (!degree) {
    return (
      <AppShell fill>
        <PlanEmptyState />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex flex-col gap-6">
        <h1 className="sr-only">Dashboard</h1>

        <section aria-label="Your metrics" className="flex flex-col gap-4">
          {previewMetrics ? (
            <UniversityMetricsPreview />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCardView view={metricViews["completion-ring"]} />
              <MetricCardView view={metricViews.wam} />
              <MetricCardView view={metricViews.tuition} />
              <MetricCardView view={metricViews.load} />
            </div>
          )}
        </section>

        <DegreeProgressHero
          progress={progress}
          unitTarget={unitTarget}
          enrolledUnits={enrolledUnits}
        />

        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <DegreeComposition
            courseLinks={Object.fromEntries(
              catalogue.courses.map((course) => [
                course.code,
                `/courses/${course.code}?year=${course.year}`,
              ]),
            )}
          />
          <MonthCalendar events={calendarEvents} />
        </div>

        {previewMetrics ? (
          <PlanningMetricsPreview />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(["mark-trend", "grade-mix", "semester-bars"] as const).map(
              (id) => (
                <MetricCardView compact key={id} view={metricViews[id]} />
              ),
            )}
          </div>
        )}

        <PlanDetailPanel
          buckets={buckets}
          courses={planCourseRows}
          risks={risks}
        />
      </div>
    </AppShell>
  );
}
