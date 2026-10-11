"use client";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import type { RuleToPlan } from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";

/**
 * Courses a structure requires and the plan does not have yet, listed flat
 * at the top so they are ready to add rather than tucked inside rules.
 */
export function RequiredCourses({
  rules,
  kind,
  onAdd,
  onOpen,
  onDragStart,
}: {
  rules: readonly RuleToPlan[];
  kind: PlanStructureKind;
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
    <section aria-label="Required courses" className="space-y-1">
      <div className="flex items-center justify-between px-1 py-1">
        <h3 className="text-xs font-semibold text-foreground">Required</h3>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">
          {`${courses.length} to add`}
        </span>
      </div>
      <ul>
        {courses.map(({ course, heading }) => (
          <CourseRow
            key={course.code}
            item={{ course, required: true, tag: heading, structureKind: kind }}
            status={null}
            onAdd={onAdd}
            onOpen={onOpen}
            onDragStart={onDragStart}
          />
        ))}
      </ul>
    </section>
  );
}
