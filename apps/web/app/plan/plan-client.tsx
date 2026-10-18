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
  const [added, setAdded] = useState<{
    from: Promise<Course[]>;
    courses: Course[];
  } | null>(null);
  useEffect(() => {
    let current = true;
    void requirementCourses.then((courses) => {
      if (current) setAdded({ from: requirementCourses, courses });
    });
    return () => {
      current = false;
    };
  }, [requirementCourses]);
  // Courses from an earlier render's promise belong to a stale catalogue.
  const addedCourses =
    added?.from === requirementCourses ? added.courses : null;
  const withRequirementCourses = useMemo(
    () =>
      addedCourses?.length
        ? { ...catalogue, courses: [...catalogue.courses, ...addedCourses] }
        : catalogue,
    [catalogue, addedCourses],
  );
  return (
    <PlanBoard
      catalogue={withRequirementCourses}
      suggestionsLoading={addedCourses === null}
    />
  );
}
