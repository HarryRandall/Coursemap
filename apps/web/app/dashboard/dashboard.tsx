"use client";

import { useMemo, type CSSProperties } from "react";
import { useCoursemap } from "@/app/providers";
import { useEntered } from "@/hooks/use-entered";
import { DegreeProgressHero } from "@/ui/dashboard/degree-progress-hero";
import { KeyDatesMetric } from "@/ui/dashboard/key-dates-metric";
import { CoverageMetric } from "@/ui/dashboard/coverage-metric";
import { UpcomingLoadMetric } from "@/ui/dashboard/upcoming-load-metric";
import { MonthCalendar } from "@/ui/dashboard/month-calendar";
import { PlanEmptyState } from "@/ui/dashboard/plan-empty-state";
import { PlanDetailPanel } from "@/ui/dashboard/plan-detail-panel";
import type { PlanCourseRow } from "@/ui/dashboard/plan-course-table";
import { GpaMetric } from "@/ui/dashboard/gpa-metric";
import { GradesMetric } from "@/ui/dashboard/grades-metric";
import { TuitionMetric } from "@/ui/dashboard/tuition-metric";
import { AverageMarkMetric } from "@/ui/dashboard/average-mark-metric";
import { DegreeComposition } from "@/ui/dashboard/degree-composition";
import { AppShell } from "@/ui/shell";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import type { UniversityCalendarEvent } from "@/lib/coursemap/university-calendar";
import { degreeComposition } from "@/lib/coursemap/degree-composition";
import {
  currentDashboardTermId,
  dashboardCalendarEvents,
  dashboardTermLoads,
} from "@/lib/coursemap/dashboard-series";
import {
  academicSummary,
  academicTermPoints,
  gradeDistribution,
  tuitionEstimate,
} from "@/lib/coursemap/academic-metrics";
import { planRisks } from "@/lib/coursemap/plan-risks";
import { requirementBucketProgress } from "@/lib/coursemap/requirement-progress";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import {
  gradeBands,
  gradeForMark,
  type GradeCode,
} from "@/lib/academic/metrics";
import {
  degreeUnitProgress,
  effectiveStatus,
  planningCourseForAttempt,
  statusLabel,
  unitsForAttempt,
} from "@/lib/planner";

export function Dashboard({
  catalogue,
  choices,
  keyDates,
  todayIso,
}: {
  catalogue: PlanCatalogue;
  choices: OnboardingCatalogue;
  /** The next few university key dates. */
  keyDates: UniversityCalendarEvent[];
  /** Today in Canberra, as YYYY-MM-DD. */
  todayIso: string;
}) {
  const { state } = useCoursemap();
  const entered = useEntered();
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

  const composition = useMemo(() => {
    const inYear = <T extends { catalogueYear: number }>(items: T[]) =>
      items.filter((item) => item.catalogueYear === catalogue.academicYear);
    return degreeComposition({
      degreeUnits: unitTarget,
      profile: state.profile,
      programme:
        inYear(choices.degrees).find(
          (item) => item.code === state.profile.degreeCode,
        ) ?? null,
      structureOptions: [...inYear(choices.majors), ...inYear(choices.minors)],
      requirements: catalogue.structureRequirements,
      attempts: state.attempts,
      catalogue: planningCatalogue,
    });
  }, [
    catalogue.academicYear,
    catalogue.structureRequirements,
    choices,
    planningCatalogue,
    state.attempts,
    state.profile,
    unitTarget,
  ]);

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
  const tuition = useMemo(
    () => tuitionEstimate(academicInputs),
    [academicInputs],
  );

  const planCourseRows = useMemo<PlanCourseRow[]>(() => {
    // Timeline terms are already in date order, with unscheduled last.
    const termOrder = new Map(
      timelineTerms.map((term, index) => [term.id, index]),
    );
    const termName = new Map(
      timelineTerms.map((term) => {
        const code = term.id.split("-").at(-1);
        const name =
          code === "s1"
            ? "Semester 1"
            : code === "s2"
              ? "Semester 2"
              : term.name;
        return [term.id, `${name} ${term.year}`];
      }),
    );
    const gradeCodes = new Set<string>(gradeBands.map((band) => band.code));
    return planned
      .map(({ attempt, course }) => {
        const status = effectiveStatus(attempt, state.attempts, catalogue);
        const code = attempt.resultCode?.toUpperCase();
        return {
          code: course.code,
          name: course.name,
          units: unitsForAttempt(attempt, course),
          termId: attempt.termId,
          termLabel:
            attempt.termId === "unscheduled"
              ? "Unscheduled"
              : (termName.get(attempt.termId) ?? "Unscheduled"),
          grade: attempt.resultCode ?? attempt.mark?.toString() ?? "—",
          gradeCode:
            code && gradeCodes.has(code)
              ? (code as GradeCode)
              : attempt.mark !== undefined
                ? gradeForMark(attempt.mark)
                : null,
          status,
          statusLabel: statusLabel(status),
        };
      })
      .sort(
        (a, b) =>
          (termOrder.get(a.termId) ?? Infinity) -
            (termOrder.get(b.termId) ?? Infinity) ||
          a.code.localeCompare(b.code),
      );
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

  // The upcoming load runs from the current semester, or between semesters
  // from the next one with courses.
  const upcomingLoads = useMemo(() => {
    const currentIndex = termLoads.findIndex(
      (load) => load.id === currentTermId,
    );
    const focusIndex =
      currentIndex >= 0
        ? currentIndex
        : termLoads.findIndex((load) => load.planned > 0);
    return focusIndex >= 0 ? termLoads.slice(focusIndex) : [];
  }, [currentTermId, termLoads]);

  if (!degree) {
    return (
      <AppShell fill>
        <PlanEmptyState />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        className="mx-auto flex flex-col gap-6"
        data-entered={entered || undefined}
      >
        <h1 className="sr-only">Dashboard</h1>

        <section aria-label="Your metrics" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GpaMetric gpa={academic.gpa} points={markTrend} />
            <GradesMetric grades={grades} />
            <TuitionMetric tuition={tuition} />
            <AverageMarkMetric points={markTrend} />
          </div>
        </section>

        <div style={{ "--enter-delay": "70ms" } as CSSProperties}>
          <DegreeProgressHero
            progress={progress}
            unitTarget={unitTarget}
            enrolledUnits={enrolledUnits}
          />
        </div>

        <div
          className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]"
          style={{ "--enter-delay": "140ms" } as CSSProperties}
        >
          <DegreeComposition
            sections={composition}
            academicYear={catalogue.academicYear}
            courseLinks={Object.fromEntries(
              catalogue.courses.map((course) => [
                course.code,
                `/courses/${course.year}/${course.code.toLowerCase()}`,
              ]),
            )}
          />
          <MonthCalendar events={calendarEvents} />
        </div>

        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          style={{ "--enter-delay": "210ms" } as CSSProperties}
        >
          <KeyDatesMetric events={keyDates} todayIso={todayIso} />
          <CoverageMetric
            termLoads={termLoads}
            unitTarget={unitTarget}
            mapped={progress.mapped}
          />
          <UpcomingLoadMetric upcoming={upcomingLoads} />
        </div>

        <PlanDetailPanel
          buckets={buckets}
          courses={planCourseRows}
          risks={risks}
        />
      </div>
    </AppShell>
  );
}
