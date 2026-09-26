"use client";
import { badgeVariantForTone } from "@/lib/ui";

import { Badge } from "@coursemap/ui/components/badge";
import { Card } from "@coursemap/ui/primitives/card";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@coursemap/ui/primitives/tabs";
import { UserActivityTimeline } from "@/ui/admin/users/user-activity-timeline";
import { ChevronDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { CatalogueIdentity } from "@/ui/admin/catalogue-table/catalogue-table";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@coursemap/ui/primitives/chart";
import { DataTableShell } from "@/ui/common/data-table";
import { UserRoleEditor } from "@/ui/admin/users/user-role-editor";
import { AppShell } from "@/ui/shell";
import { FilterBar } from "@/ui/common/filter-bar";
import { GeneratedAvatar } from "@/ui/common/generated-avatar";
import {
  adminUserStudyProgress,
  adminUserTermLoads,
  uniqueTrackedCourseCount,
} from "@/lib/admin/user-study";
import type {
  AdminUserDetailData,
  AdminUserCourseStatus,
} from "@/lib/admin/users";

const statuses = {
  planned: { label: "Planned", tone: "info" },
  enrolled: { label: "In progress", tone: "brand" },
  completed: { label: "Completed", tone: "success" },
  credited: { label: "Credit", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
} as const;
const chartConfig = {
  completed: { label: "Completed / credited", color: "var(--primary)" },
  planned: { label: "Planned / enrolled", color: "var(--chart-2)" },
} satisfies ChartConfig;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card className={`p-4 sm:p-5 ${className}`}>{children}</Card>;
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[13px] leading-5 break-words">{children}</dd>
    </div>
  );
}

export function AdminUserDetail({
  data,
  currentUserId,
  accountAgeDays,
}: {
  data: AdminUserDetailData;
  currentUserId: string;
  accountAgeDays: number;
}) {
  const searchParams = useSearchParams();
  const tabFromValue = (value: string | null) =>
    value === "activity"
      ? "activity"
      : value === "study" || value === "courses"
        ? "study"
        : "overview";
  const activeTab = tabFromValue(searchParams.get("tab"));
  const selectTab = (value: string) => {
    const url = new URL(window.location.href);
    if (value === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const plan = data.study.plan;
  const programme = data.study.structures.find(
    (item) => item.role === "programme",
  );
  const studyAreas = [
    {
      label: "Major",
      structures: data.study.structures.filter(
        (structure) => structure.role === "major",
      ),
    },
    {
      label: "Minors",
      structures: data.study.structures.filter(
        (structure) => structure.role === "minor",
      ),
    },
    {
      label: "Specialisations",
      structures: data.study.structures.filter(
        (structure) => structure.role === "specialisation",
      ),
    },
  ];
  const role = data.roles.find(
    (item) => item.key === (data.assignments[0]?.roleKey ?? "user"),
  );
  const progress = adminUserStudyProgress(data.study);
  const terms = adminUserTermLoads(data.study.courses);
  const tracked = uniqueTrackedCourseCount(data.study.courses);
  const filteredCourses = data.study.courses.filter(
    (course) =>
      (!status || course.status === status) &&
      `${course.code} ${course.title}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const completedCourses = uniqueTrackedCourseCount(
    data.study.courses.filter(
      (course) => course.status === "completed" || course.status === "credited",
    ),
  );
  const metrics = [
    {
      label: "Degree completion",
      value: !plan
        ? "Not started"
        : progress.total
          ? `${progress.percent}%`
          : "Unavailable",
      detail: progress.total
        ? `${progress.completed} of ${progress.total} units`
        : "No degree requirements available",
    },
    {
      label: "Courses completed",
      value: completedCourses,
      detail: "Completed or credited courses",
    },
    {
      label: "Courses tracked",
      value: tracked,
      detail: "Unique courses in plan and history",
    },
    {
      label: "Units planned",
      value: progress.planned,
      detail: "Planned and enrolled courses",
    },
  ];
  const tabs = (
    <TabsList aria-label="User sections" variant="line">
      {[
        { value: "overview", label: "Overview" },
        { value: "study", label: "Study" },
        { value: "activity", label: "Activity" },
      ].map((tab) => (
        <TabsTrigger key={tab.value} value={tab.value}>
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
  return (
    <Tabs value={activeTab} onValueChange={selectTab} className="block">
      <AppShell
        admin
        currentBreadcrumbLabel={data.user.displayName}
        tabs={tabs}
      >
        <div className="mx-auto w-full min-w-0 space-y-5">
          <header className="sticky top-[6.5rem] z-20 flex items-center gap-3 bg-background py-2 md:top-0">
            <GeneratedAvatar
              name={data.user.displayName}
              email={data.user.email}
              className="size-11 shrink-0 text-sm"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight break-words">
                  {data.user.displayName}
                </h1>
                <Badge variant={"outline"}>{role?.name ?? "User"}</Badge>
                {!plan ? (
                  <Badge variant={"warning-light"}>Onboarding incomplete</Badge>
                ) : null}
                {data.user.userId === currentUserId ? (
                  <Badge variant={"primary-light"}>You</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] break-all text-muted-foreground">
                {data.user.email ?? "No email address"}
              </p>
            </div>
          </header>

          <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Panel>
                <dl>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Account age
                  </dt>
                  <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                    {accountAgeDays}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {accountAgeDays === 1 ? "day" : "days"}
                    </span>
                  </dd>
                  <dd className="mt-2 text-xs text-muted-foreground">
                    Joined {formatDate(data.user.createdAt)}
                  </dd>
                </dl>
              </Panel>
              <Panel>
                <dl>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Profile updated
                  </dt>
                  <dd className="mt-2 text-xl font-semibold tracking-tight">
                    {formatDate(data.user.updatedAt)}
                  </dd>
                </dl>
              </Panel>
              <Panel>
                <dl>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Onboarding
                  </dt>
                  <dd className="mt-2 text-xl font-semibold tracking-tight">
                    {plan ? "Complete" : "Incomplete"}
                  </dd>
                </dl>
              </Panel>
            </div>
            <UserRoleEditor
              user={data.user}
              roles={data.roles}
              permissions={data.permissions}
              assignments={data.assignments}
              currentUserId={currentUserId}
            />

            <Panel>
              <h2 className="mb-4 text-sm font-semibold">Account details</h2>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Name">{data.user.displayName}</Detail>
                <Detail label="Email">
                  {data.user.email ?? "Not supplied"}
                </Detail>
                <Detail label="Student number">
                  {data.user.studentNumber ?? "Not supplied"}
                </Detail>
                <Detail label="Joined">
                  {formatDate(data.user.createdAt)}
                </Detail>
              </dl>
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 -ml-3"
                    type="button"
                  >
                    Record details
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-3.5 ${detailsOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <dl className="grid gap-5 pt-3 sm:grid-cols-2">
                    <Detail label="User ID">
                      <span className="font-mono text-xs break-all">
                        {data.user.userId}
                      </span>
                    </Detail>
                  </dl>
                </CollapsibleContent>
              </Collapsible>
            </Panel>
          </TabsContent>
          <TabsContent value="study" className="space-y-5">
            {plan ? (
              <section aria-labelledby="details-heading" className="space-y-5">
                <h2 id="details-heading" className="text-sm font-semibold">
                  Degree details
                </h2>
                <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  {plan ? (
                    <>
                      <Detail label="Programme">
                        {programme
                          ? `${programme.name} (${programme.code})`
                          : plan.name}
                      </Detail>
                      <Detail label="Study load">
                        {plan.studyLoad === "full_time"
                          ? "Full time"
                          : "Part time"}
                      </Detail>
                      <Detail label="Commencement">
                        {plan.commencementYear}
                      </Detail>
                      <Detail label="Catalogue">{plan.catalogueYear}</Detail>
                      {studyAreas
                        .filter((area) => area.structures.length > 0)
                        .map((area) => (
                          <Detail key={area.label} label={area.label}>
                            {area.structures
                              .map(
                                (structure) =>
                                  `${structure.name} (${structure.code})`,
                              )
                              .join(", ")}
                          </Detail>
                        ))}
                    </>
                  ) : null}
                </dl>
              </section>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <Panel key={metric.label}>
                  <dl>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {metric.label}
                    </dt>
                    <dd className="mt-2 flex flex-wrap items-baseline gap-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                      {metric.value}
                    </dd>
                    <dd className="mt-2 text-xs text-muted-foreground">
                      {metric.detail}
                    </dd>
                  </dl>
                </Panel>
              ))}
            </div>

            {plan && terms.length > 0 ? (
              <section aria-labelledby="study-load-heading">
                <Panel>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <h2
                      id="study-load-heading"
                      className="text-sm font-semibold"
                    >
                      Study load by semester
                    </h2>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {Object.entries(chartConfig).map(([key, item]) => (
                        <span key={key} className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChartContainer config={chartConfig} className="h-64 w-full">
                    <BarChart
                      accessibilityLayer
                      data={terms}
                      margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                      />
                      <YAxis
                        width={34}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent />}
                      />
                      <Bar
                        dataKey="completed"
                        stackId="units"
                        fill="var(--color-completed)"
                        maxBarSize={48}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="planned"
                        stackId="units"
                        fill="var(--color-planned)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ChartContainer>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Units per semester. Unscheduled, failed and withdrawn
                    records are excluded.
                  </p>
                  <table className="sr-only">
                    <caption>Study load in units by semester</caption>
                    <thead>
                      <tr>
                        <th>Semester</th>
                        <th>Completed or credited</th>
                        <th>Planned or enrolled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terms.map((term) => (
                        <tr key={term.id}>
                          <th>{term.label}</th>
                          <td>{term.completed}</td>
                          <td>{term.planned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </section>
            ) : !plan ? (
              <p className="text-sm text-muted-foreground">
                This user has not saved a primary degree plan yet.
              </p>
            ) : null}

            {plan || data.study.courses.length > 0 ? (
              <section
                id="courses"
                aria-labelledby="courses-heading"
                className="space-y-4"
              >
                <h2 id="courses-heading" className="text-sm font-semibold">
                  Courses
                </h2>
                {data.study.courses.length > 8 ? (
                  <FilterBar
                    searchPlaceholder="Search courses"
                    filters={[
                      {
                        key: "status",
                        label: "Status",
                        options: Object.entries(statuses).map(
                          ([value, item]) => ({
                            value,
                            label: item.label,
                          }),
                        ),
                      },
                    ]}
                    state={{
                      query,
                      values: { status },
                      onQueryChange: setQuery,
                      onFilterChange: (_, value) => setStatus(value),
                    }}
                  />
                ) : null}
                <DataTableShell>
                  <div
                    className="max-h-[32rem] overflow-auto"
                    role="region"
                    aria-label="User courses"
                    tabIndex={0}
                  >
                    <Table className="min-w-[640px] text-sm">
                      <caption className="sr-only">
                        Planned courses and recorded course attempts
                      </caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-5">Course</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Semester</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                          <TableHead className="pr-5 text-right">
                            Mark
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCourses.length ? (
                          filteredCourses.map((course) => (
                            <TableRow key={course.id}>
                              <TableCell className="py-4 pl-5">
                                <CatalogueIdentity
                                  code={course.code}
                                  title={course.title}
                                />
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    badgeVariantForTone[
                                      statuses[
                                        course.status as AdminUserCourseStatus
                                      ].tone
                                    ]
                                  }
                                >
                                  {statuses[course.status].label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {course.calendarYear !== null &&
                                course.periodCode
                                  ? `${course.periodShortName ?? course.periodName ?? course.periodCode} ${course.calendarYear}`
                                  : "Unscheduled"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {course.units}
                              </TableCell>
                              <TableCell className="pr-5 text-right tabular-nums">
                                {course.mark ?? (
                                  <span aria-label="No mark recorded">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="h-24 text-center text-muted-foreground"
                            >
                              {data.study.courses.length
                                ? "No matching courses"
                                : "No courses recorded yet"}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </DataTableShell>
              </section>
            ) : null}
          </TabsContent>
          <TabsContent value="activity">
            <UserActivityTimeline />
          </TabsContent>
        </div>
      </AppShell>
    </Tabs>
  );
}
