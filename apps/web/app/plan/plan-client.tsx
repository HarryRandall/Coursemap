"use client";
import { useEffect, useMemo, useState } from "react";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Course } from "@/lib/coursemap/types";
import { PlanBoard } from "@/ui/plan/plan-board";

export function PlanClient({
  catalogue,
  requirementCourses,
}: {
  catalogue: PlanCatalogue;
  /** Streamed from the server once the board has rendered. */
  requirementCourses: Promise<Course[]>;
}) {
  // Every plan action revalidates the page, which streams a new promise. The
  // last courses to arrive stay until it settles so the side panel keeps its
  // content; only the first load has nothing to show yet.
  const [addedCourses, setAddedCourses] = useState<Course[] | null>(null);
  useEffect(() => {
    let current = true;
    void requirementCourses.then((courses) => {
      if (current) setAddedCourses(courses);
    });
    return () => {
      current = false;
    };
  }, [requirementCourses]);
  const withRequirementCourses = useMemo(() => {
    // Courses held over from an earlier promise may have joined the catalogue
    // since, and an edition it lists for the plan year replaces them.
    const known = new Set(
      catalogue.courses.map((course) => `${course.year}:${course.code}`),
    );
    const added = (addedCourses ?? []).filter(
      (course) =>
        !known.has(`${course.year}:${course.code}`) &&
        !known.has(`${catalogue.academicYear}:${course.code}`),
    );
    return added.length
      ? { ...catalogue, courses: [...catalogue.courses, ...added] }
      : catalogue;
  }, [catalogue, addedCourses]);
  return (
    <PlanBoard
      catalogue={withRequirementCourses}
      suggestionsLoading={addedCourses === null}
    />
  );
}
