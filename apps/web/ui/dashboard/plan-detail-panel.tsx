"use client";

import { useState } from "react";
import { Badge } from "@coursemap/ui/components/badge";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@coursemap/ui/primitives/tabs";

import { cn } from "@/lib/cn";
import type { PlanRisk } from "@/lib/coursemap/plan-risks";
import type { RequirementBucketProgress } from "@/lib/coursemap/requirement-progress";
import { RequirementsTable } from "@/ui/dashboard/requirements-table";
import {
  PlanCourseTable,
  type PlanCourseRow,
} from "@/ui/dashboard/plan-course-table";
import { PlanRiskList } from "@/ui/dashboard/plan-risk-list";
import { PlanDetailEmpty } from "@/ui/dashboard/plan-detail-empty";

/**
 * The full read of the plan, in one card with three views: the requirement
 * ledger, every course, and whatever still needs a decision. Keeping them
 * behind tabs rather than three stacked cards holds the page to one screen.
 */
export function PlanDetailPanel({
  buckets,
  courses,
  risks,
}: {
  buckets: readonly RequirementBucketProgress[];
  courses: readonly PlanCourseRow[];
  risks: readonly PlanRisk[];
}) {
  const [tab, setTab] = useState("requirements");

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-5">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Detail</h2>
            <TabsList>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="courses">Courses</TabsTrigger>
              <TabsTrigger value="risks" className="gap-2">
                Risks
                {risks.length > 0 ? (
                  <Badge
                    variant={tab === "risks" ? "primary-light" : "outline"}
                    className={cn(
                      "tabular-nums",
                      tab !== "risks" && "text-muted-foreground",
                    )}
                  >
                    {risks.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="requirements" className="overflow-x-auto pt-4">
            {buckets.length ? (
              <RequirementsTable buckets={buckets} />
            ) : (
              <PlanDetailEmpty
                title="No requirements to measure yet"
                description="Your degree's rules are either not chosen or only written as notes. The Requirements page shows ANU's full wording."
                action={{ href: "/requirements", label: "Open requirements" }}
              />
            )}
          </TabsContent>
          <TabsContent value="courses" className="overflow-x-auto pt-4">
            {courses.length ? (
              <PlanCourseTable courses={courses} />
            ) : (
              <PlanDetailEmpty
                title="No courses in your plan yet"
                description="Courses you add in the planner are listed here with their semester, units and result."
                action={{ href: "/plan", label: "Open planner" }}
              />
            )}
          </TabsContent>
          <TabsContent value="risks" className="pt-4">
            {risks.length || courses.length ? (
              <PlanRiskList risks={risks} />
            ) : (
              <PlanDetailEmpty
                title="Nothing to check yet"
                description="Once your plan has courses, anything blocked or short of a requirement is flagged here."
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
