"use client";

import Link from "next/link";
import {
  boundedRequirement,
  requirementCourseParams,
} from "@/lib/coursemap/requirement-course-filters";
import type {
  RequirementTreeCondition,
  TreeContext,
} from "./requirement-presentation";
import { courseSearchHref } from "./requirement-presentation";
import { PaginatedMatchingCourses } from "./paginated-matching-courses";

export function MatchingCourses({
  condition,
  context,
}: {
  condition: RequirementTreeCondition;
  context: TreeContext;
}) {
  const year = context.catalogue.academicYear;
  if (year === null)
    return (
      <p className="text-xs text-muted-foreground">
        Select a catalogue year to see matching courses.
      </p>
    );
  if (!boundedRequirement(condition)) {
    const href = courseSearchHref(condition, year);
    return href ? (
      <Link
        href={href}
        className="text-xs font-medium text-primary hover:underline"
      >
        Browse elective courses
      </Link>
    ) : null;
  }
  const ruleKey = requirementCourseParams(condition, year).toString();
  return (
    <PaginatedMatchingCourses
      key={ruleKey}
      ruleKey={ruleKey}
      year={year}
      context={context}
    />
  );
}
