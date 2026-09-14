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

import {
  requirementBucketStatus,
  type RequirementBucketProgress,
} from "@/lib/coursemap/requirement-progress";
import { RequirementBar } from "@/ui/dashboard/requirement-bar";

const STATUS_VARIANT = {
  complete: "success",
  scheduled: "default",
  short: "warning",
  untargeted: "outline",
} as const;

/**
 * Every programme requirement group, with completed and scheduled units kept
 * apart so a group met only by planned work does not read as finished.
 */
export function RequirementsTable({
  buckets,
}: {
  buckets: readonly RequirementBucketProgress[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requirement</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Done</TableHead>
          <TableHead className="text-right">Needed</TableHead>
          <TableHead className="w-[26%]">Progress</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {buckets.map((bucket) => {
          const { status, label } = requirementBucketStatus(bucket);
          return (
            <TableRow key={bucket.key}>
              <TableCell className="font-medium">
                <span title={bucket.description || bucket.title}>
                  {bucket.title}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {bucket.kind}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {bucket.completedUnits}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {bucket.targetUnits ?? "—"}
              </TableCell>
              <TableCell>
                <RequirementBar
                  completedUnits={bucket.completedUnits}
                  plannedUnits={bucket.plannedUnits}
                  targetUnits={bucket.targetUnits}
                  height={6}
                />
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={STATUS_VARIANT[status]}>{label}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
