"use client";

import { useState } from "react";
import { Pagination } from "@/ui/common/pagination";
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
  const hasCourseDetails = sorted.some((code) => courseFor(code));
  const pageCount = Math.max(1, Math.ceil(sorted.length / 6));
  const safePage = Math.min(page, pageCount);
  return (
    <div className="space-y-4">
      <ul
        className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${hasCourseDetails ? (showStatus ? "auto-rows-[14rem]" : "auto-rows-[11rem]") : "auto-rows-[9rem]"}`}
      >
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
          />
        ))}
        {Array.from(
          {
            length:
              Math.min(6, sorted.length) -
              sorted.slice((safePage - 1) * 6, safePage * 6).length,
          },
          (_, index) => (
            <li
              key={`space-${index}`}
              aria-hidden="true"
              className="invisible"
            />
          ),
        )}
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
