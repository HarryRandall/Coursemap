"use client";
import { Badge } from "@coursemap/ui/components/badge";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type { CourseHints, RuleToPlan } from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";

/**
 * Courses a structure requires and the plan does not have yet, listed flat
 * at the top so they are ready to add rather than tucked inside rules.
 */
export function RequiredCourses({
  rules,
  kind,
  hints,
  onAdd,
  onOpen,
  onDragStart,
}: {
  rules: readonly RuleToPlan[];
  kind: PlanStructureKind;
  hints?: CourseHints;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
}) {
  const seen = new Set<string>();
  const courses = rules.flatMap((rule) =>
    rule.courses.flatMap((item) => {
      if (item.status !== null || !item.course || seen.has(item.code))
        return [];
      seen.add(item.code);
      return [{ course: item.course, heading: rule.heading }];
    }),
  );
  if (courses.length === 0) return null;
  return (
    <section aria-label="Required courses" className="space-y-2">
      <div className="flex min-h-7 items-center justify-between gap-2 px-1">
        <h3 className="text-[13px] font-semibold text-foreground">Must take</h3>
        <Badge variant="warning-light" className="tabular-nums">
          {`${courses.length} left`}
        </Badge>
      </div>
      <ul>
        {courses.map(({ course, heading }) => (
          <CourseRow
            key={course.code}
            item={{ course, required: true, tag: heading, structureKind: kind }}
            status={null}
            prerequisites={hints?.prerequisites(course)}
            onAdd={onAdd}
            onOpen={onOpen}
            onDragStart={onDragStart}
          />
        ))}
      </ul>
    </section>
  );
}
