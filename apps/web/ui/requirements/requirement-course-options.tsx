"use client";

import { useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { PlacementControl } from "./placement-control";
import { RequirementCourseRow } from "./requirement-course-row";
import type { TreeContext } from "./requirement-presentation";

export function RequirementCourseOptions({
  codes,
  required,
  context,
  repeatUnitsByCode,
}: {
  codes: string[];
  required: boolean;
  context: TreeContext;
  /** Listed courses that may count more than once, with their unit totals. */
  repeatUnitsByCode?: ReadonlyMap<string, number>;
}) {
  const [visibleCount, setVisibleCount] = useState(12);
  const rank = (code: string) =>
    context.attemptStatusByCode.get(code) === "completed"
      ? 0
      : context.attemptStatusByCode.has(code)
        ? 1
        : 2;
  const courseFor = (code: string) =>
    context.catalogue.courses.find(
      (course) =>
        course.code === code && course.year === context.catalogue.academicYear,
    );
  const showStatus = context.showPlanProgress !== false;
  const sorted = [...codes].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {sorted.slice(0, visibleCount).map((code) => (
          <RequirementCourseRow
            key={code}
            code={code}
            year={context.catalogue.academicYear ?? new Date().getFullYear()}
            course={courseFor(code)}
            required={required}
            repeatUnits={repeatUnitsByCode?.get(code) ?? null}
            status={context.attemptStatusByCode.get(code) ?? null}
            showStatus={showStatus}
            onAdd={context.onAddCourse}
            placement={
              context.placement && context.attemptStatusByCode.has(code) ? (
                <PlacementControl
                  courseCode={code}
                  placement={context.placement}
                />
              ) : undefined
            }
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {codes.length} matching {codes.length === 1 ? "course" : "courses"}
      </p>
      {codes.length > visibleCount ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setVisibleCount(visibleCount + 12)}
        >
          Show {codes.length - visibleCount} more
        </Button>
      ) : null}
    </div>
  );
}
