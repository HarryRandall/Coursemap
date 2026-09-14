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

import type { EffectiveStatus } from "@/lib/planner";

export type PlanCourseRow = {
  code: string;
  name: string;
  units: number;
  termLabel: string;
  grade: string;
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

/** Every course in the plan, newest term last, with its result when there is one. */
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
              {course.grade}
            </TableCell>
            <TableCell className="text-right">
              <Badge
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
