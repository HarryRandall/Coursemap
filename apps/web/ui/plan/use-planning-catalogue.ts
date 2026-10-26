"use client";
import { useMemo } from "react";
import { useCoursemap } from "@/app/providers";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { planStructureCodes } from "@/lib/coursemap/plan-structure-codes";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import { creditedRequirementUnits } from "@/lib/coursemap/requirement-progress";
import type { Course } from "@/lib/coursemap/types";

/**
 * The student's catalogue as the planner reads it: the degree's semesters
 * from the start year, their course overrides and credited units, and any
 * courses loaded since the page arrived.
 */
export function usePlanningCatalogue(
  catalogue: PlanCatalogue,
  fetchedCourses: readonly Course[] = [],
) {
  const { state } = useCoursemap();
  const degree = catalogue.degrees.find(
    (item) => item.code === state.profile.degreeCode,
  );
  const timelineDegree = degree ?? undefined;
  const degreeYears = useMemo(
    () =>
      planTimelineYears({
        degree: timelineDegree,
        commencementYear: state.profile.commencementYear,
        extensionYears: state.profile.extensionYears,
      }),
    [
      state.profile.commencementYear,
      state.profile.extensionYears,
      timelineDegree,
    ],
  );
  const timelineTerms = useMemo(
    () => planTimelineTerms({ terms: catalogue.terms, years: degreeYears }),
    [catalogue.terms, degreeYears],
  );
  const planningCatalogue = useMemo(() => {
    const known = [
      ...catalogue.courses,
      ...fetchedCourses.filter(
        (course) =>
          !catalogue.courses.some((item) => item.code === course.code),
      ),
    ];
    const base = {
      ...catalogue,
      courseOverrides: state.courseOverrides,
      creditedRequirementUnits: creditedRequirementUnits(
        catalogue.structureRequirements,
        state.requirementOverrides ?? [],
        new Set([
          state.profile.degreeCode,
          state.profile.majorCode,
          ...(state.profile.minorCodes ?? []),
          ...(state.profile.specialisationCodes ?? []),
        ]),
      ),
      courses: known,
      terms: timelineTerms,
      commencementYear: state.profile.commencementYear,
      enrolmentMode: state.profile.enrolmentMode,
      programmeCodes: state.profile.degreeCode
        ? [state.profile.degreeCode]
        : [],
      structureCodes: planStructureCodes({
        majorCode: state.profile.majorCode,
        minorCodes: state.profile.minorCodes,
        specialisationCodes: state.profile.specialisationCodes,
      }),
    };
    return base;
  }, [
    catalogue,
    fetchedCourses,
    timelineTerms,
    state.courseOverrides,
    state.requirementOverrides,
    state.profile.majorCode,
    state.profile.minorCodes,
    state.profile.specialisationCodes,
    state.profile.commencementYear,
    state.profile.enrolmentMode,
    state.profile.degreeCode,
  ]);

  return { degree, timelineTerms, planningCatalogue };
}
