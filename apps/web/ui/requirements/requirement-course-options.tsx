"use client";

import { useState } from "react";
import { Pagination } from "@/ui/common/pagination";
import { PlacementControl } from "./placement-control";
import { RequirementCourseRow } from "./requirement-course-row";
import type { TreeContext } from "./requirement-presentation";

export function RequirementCourseOptions({
  codes,
  required,
  context,
}: {
  codes: string[];
  required: boolean;
  context: TreeContext;
}) {
  const [page, setPage] = useState(1);
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
  const pageCount = Math.max(1, Math.ceil(sorted.length / 6));
  const safePage = Math.min(page, pageCount);
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {sorted.slice((safePage - 1) * 6, safePage * 6).map((code) => (
          <RequirementCourseRow
            key={code}
            code={code}
            year={context.catalogue.academicYear ?? new Date().getFullYear()}
            course={courseFor(code)}
            required={required}
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
      {codes.length > 6 && (
        <Pagination
          page={safePage}
          pageSize={6}
          total={sorted.length}
          itemName="courses"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
