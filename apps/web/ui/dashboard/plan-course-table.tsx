"use client";

import { Badge } from "@coursemap/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";

import type { GradeCode } from "@/lib/academic/metrics";
import type { EffectiveStatus } from "@/lib/planner";
import { gradeColours } from "./grade-colours";
import { darkStatusTint } from "./status-badge-tint";

export type PlanCourseRow = {
  code: string;
  name: string;
  units: number;
  termLabel: string;
  grade: string;
  /** The grade band behind the result, when it has one. */
  gradeCode: GradeCode | null;
  status: EffectiveStatus;
  statusLabel: string;
};

const STATUS_VARIANT: Record<EffectiveStatus, string> = {
  completed: "success",
  enrolled: "info",
  planned: "secondary",
  blocked: "warning",
  approval: "warning",
  failed: "destructive",
  withdrawn: "outline",
};

/** Every course in the plan, in the order it is taken, with its result. */
export function PlanCourseTable({
  courses,
}: {
  courses: readonly PlanCourseRow[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Course</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Semester</TableHead>
          <TableHead className="text-right">Units</TableHead>
          <TableHead className="text-right">Result</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.map((course) => (
          <TableRow key={`${course.code}-${course.termLabel}`}>
            <TableCell className="font-mono text-xs font-medium">
              {course.code}
            </TableCell>
            <TableCell className="max-w-[22rem] truncate">
              {course.name}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {course.termLabel}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {course.units}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {course.gradeCode ? (
                <span
                  className="inline-flex min-w-8 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
                  style={{
                    color: gradeColours[course.gradeCode],
                    backgroundColor: `color-mix(in oklab, ${gradeColours[course.gradeCode]} 16%, transparent)`,
                  }}
                >
                  {course.grade}
                </span>
              ) : (
                course.grade
              )}
            </TableCell>
            <TableCell className="text-right">
              <Badge
                className={darkStatusTint[STATUS_VARIANT[course.status]]}
                variant={
                  STATUS_VARIANT[course.status] as React.ComponentProps<
                    typeof Badge
                  >["variant"]
                }
              >
                {course.statusLabel}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
