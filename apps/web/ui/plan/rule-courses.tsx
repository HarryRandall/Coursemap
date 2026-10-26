"use client";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type {
  CourseHints,
  RuleCourse,
  RuleToPlan,
} from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";
import { RuleMatchingCourses } from "@/ui/plan/rule-matching-courses";
import { AnyCourseSearch } from "@/ui/plan/any-course-search";
import {
  SUGGESTION_COUNT,
  SuggestedCourses,
} from "@/ui/plan/suggested-courses";

/** A rule naming more courses than this shows suggestions first. */
const SHORT_LIST = SUGGESTION_COUNT + 1;

/** Whether a rule is one any course fills, so its courses come from a catalogue search. */
export function isAnyCourseRule(
  rule: RuleToPlan,
  hints: CourseHints | undefined,
) {
  return (
    rule.courses.length === 0 &&
    rule.matching === null &&
    !rule.options?.length &&
    (hints?.academicYear ?? null) !== null
  );
}

/** Whether a rule has courses to show once opened. */
export function hasRuleCourses(
  rule: RuleToPlan,
  hints: CourseHints | undefined,
  readOnly: boolean,
) {
  const listed = rule.courses.filter(
    (item) => item.course && (readOnly || item.status === null),
  ).length;
  return (
    listed > 0 ||
    Boolean(rule.options?.length) ||
    rule.matching !== null ||
    (!readOnly && isAnyCourseRule(rule, hints))
  );
}

/**
 * The courses that count towards one rule: a short list in full, a long one
 * as suggestions that open to every course, the courses a tag or subject
 * rule matches, or a catalogue search for a rule any course fills. Courses
 * already in the plan leave the list unless it is read-only.
 */
export function RuleCourses({
  rule,
  kind,
  hints,
  suggested,
  onAdd,
  onOpen,
  onDragStart,
  readOnly = false,
  expanded = false,
}: {
  /** Shows the course lists with their search boxes open, where there is room. */
  expanded?: boolean;
  rule: RuleToPlan;
  kind: PlanStructureKind;
  hints?: CourseHints;
  /** Codes to suggest first, chosen so another rule does not repeat them. */
  suggested?: readonly string[];
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  /** Absent where there is no board to drag a course onto. */
  onDragStart?: DragStart;
  readOnly?: boolean;
}) {
  // A course no catalogue year publishes cannot be planned, so it is left out.
  const courses = rule.courses.flatMap(({ code, course, status }) =>
    course && (readOnly || status === null) ? [{ code, course, status }] : [],
  );
  const academicYear = hints?.academicYear ?? null;
  const row = (course: Course, status: RuleCourse["status"] = null) => (
    <CourseRow
      key={course.code}
      item={{
        course,
        required: rule.compulsory,
        tag: rule.heading,
        structureKind: kind,
      }}
      status={status}
      readOnly={readOnly}
      prerequisites={hints?.prerequisites(course)}
      onAdd={onAdd}
      onOpen={onOpen}
      onDragStart={onDragStart}
    />
  );
  const published = courses.map((item) => item.course);
  if (!readOnly && published.length > SHORT_LIST) {
    return (
      <SuggestedCourses
        label={rule.heading}
        courses={hints ? hints.rank(published) : published}
        suggested={suggested}
        expanded={expanded}
        renderCourse={(course) => row(course)}
      />
    );
  }
  return (
    <>
      {courses.length > 0 ? (
        <ul>{courses.map(({ course, status }) => row(course, status))}</ul>
      ) : null}
      {rule.matching ? (
        <RuleMatchingCourses
          rule={rule}
          matching={rule.matching}
          kind={kind}
          hints={hints}
          onAdd={onAdd}
          onOpen={onOpen}
          onDragStart={onDragStart}
          readOnly={readOnly}
          expanded={expanded}
        />
      ) : null}
      {!readOnly &&
      isAnyCourseRule(rule, hints) &&
      academicYear !== null &&
      hints ? (
        <>
          <AnyCourseSearch
            label={rule.heading}
            academicYear={academicYear}
            rank={hints.rank}
            defaultOpen={expanded}
            level={hints.electiveLevel}
            renderCourse={(course) => row(course)}
          />
        </>
      ) : null}
    </>
  );
}
