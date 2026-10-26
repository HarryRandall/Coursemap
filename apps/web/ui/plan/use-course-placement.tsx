"use client";
import { useMemo, useState } from "react";
import { useCoursemap } from "@/app/providers";
import { isSemesterTerm } from "@/lib/coursemap/academic-periods";
import { planStudentRecord } from "@/lib/coursemap/plan-student-record";
import {
  planPrerequisites,
  suggestedPlacement,
  termPlacements,
  type PlanPrerequisites,
} from "@/lib/coursemap/term-placement";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Course, Term } from "@/lib/coursemap/types";
import { AddCourseSheet } from "@/ui/plan/add-course-sheet";
import {
  courseForTerm,
  rankCourses,
  type CourseHints,
} from "@/ui/plan/plan-suggestions";

/**
 * Adding courses from any page: what the plan says about a course before it
 * is added, and the sheet that asks which semester it goes in. Adding a
 * prerequisite from a course's sheet opens the prerequisite over it, and
 * closing returns to the course.
 */
export function useCoursePlacement({
  catalogue,
  timelineTerms,
  findCourse,
}: {
  /** The planning catalogue, with the plan's own semesters. */
  catalogue: PlanCatalogue;
  timelineTerms: readonly Term[];
  findCourse: (code: string) => Course | undefined;
}) {
  const { state, addCourse, notify } = useCoursemap();
  const [placing, setPlacing] = useState<Course[]>([]);

  const hints = useMemo<CourseHints>(() => {
    const known = new Map<string, PlanPrerequisites>();
    const prerequisites = (course: Course) => {
      const cached = known.get(course.code);
      if (cached !== undefined) return cached;
      const result = planPrerequisites(course, state.attempts, catalogue);
      known.set(course.code, result);
      return result;
    };
    const planCodes = new Set(
      state.attempts
        .filter((attempt) => attempt.status !== "withdrawn")
        .map((attempt) => attempt.courseCode),
    );
    const career = catalogue.programmeCareers?.find(
      (item) => item.code === state.profile.degreeCode,
    )?.career;
    return {
      academicYear: catalogue.academicYear,
      // Undergraduate courses run from 1000 to 4000 level, so a bachelor's
      // electives leave out postgraduate courses.
      electiveLevel: career === "undergraduate" ? "1-4" : undefined,
      prerequisites,
      rank: (courses) => rankCourses(courses, { planCodes, prerequisites }),
    };
  }, [state.attempts, state.profile.degreeCode, catalogue]);

  // Only semesters from the first year still under way can take a new course.
  const firstOpenYear = [...new Set(timelineTerms.map((term) => term.year))]
    .sort((left, right) => left - right)
    .find((year) => {
      const yearTerms = new Set(
        timelineTerms
          .filter((term) => term.year === year)
          .map((term) => term.id),
      );
      const attempts = state.attempts.filter(
        (attempt) =>
          yearTerms.has(attempt.termId) && attempt.status !== "withdrawn",
      );
      return (
        attempts.length === 0 ||
        attempts.some((attempt) => attempt.status !== "completed")
      );
    });
  const placementTerms = timelineTerms.filter(
    (term) =>
      isSemesterTerm(term) &&
      (firstOpenYear === undefined || term.year >= firstOpenYear),
  );

  const open = (course: Course) =>
    setPlacing((current) =>
      current.some((item) => item.code === course.code)
        ? current
        : [...current, course],
    );
  const close = () => setPlacing((current) => current.slice(0, -1));
  const add = async (picked: Course, termId: string) => {
    const term = timelineTerms.find((item) => item.id === termId);
    if (!term) return;
    const course = courseForTerm(picked.code, term, catalogue) ?? picked;
    const result = await addCourse(course.code, term.id, course.year);
    notify(
      result.ok
        ? `${course.code} added to ${term.name} ${term.year}`
        : result.message,
      result.ok ? "success" : "warning",
    );
    if (result.ok) close();
  };

  const course = placing.at(-1);
  const placements = course
    ? termPlacements({
        course,
        terms: placementTerms,
        attempts: state.attempts,
        catalogue,
      })
    : [];
  const sheet = course ? (
    <AddCourseSheet
      key={course.code}
      course={course}
      placements={placements}
      initialTermId={suggestedPlacement(placements)?.term.id ?? null}
      studentFor={(termId) =>
        planStudentRecord(
          {
            id: "placement",
            academicYear: course.year,
            courseCode: course.code,
            termId,
            status: "planned",
          },
          state.attempts,
          state.profile,
          state.profile.commencementYear ?? null,
          catalogue,
        )
      }
      findCourse={findCourse}
      parentCode={placing.at(-2)?.code}
      onAdd={(termId) => void add(course, termId)}
      onAddPrerequisite={open}
      onClose={close}
    />
  ) : null;

  return { hints, open, sheet };
}
