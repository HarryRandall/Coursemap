import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import {
  type AdminDashboardData,
  publishedCourseCount,
} from "@/lib/admin/dashboard";
import { ShareRing } from "@/ui/common/share-ring";
import { Sparkline } from "@/ui/common/sparkline";
import { AttentionQueues } from "@/ui/admin/dashboard/attention-queues";
import { CatalogueReadiness } from "@/ui/admin/dashboard/catalogue-readiness";
import { ChangeCalendar } from "@/ui/admin/dashboard/change-calendar";
import { KpiTile } from "@/ui/common/kpi-tile";
import { SyncOutcomesChart } from "@/ui/admin/dashboard/sync-outcomes-chart";
import { TopCoursesChart } from "@/ui/admin/dashboard/top-courses-chart";
import { UserActivityChart } from "@/ui/admin/dashboard/user-activity-chart";
import { formatCount } from "@/lib/canberra-format";

function Panel({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {aside ? (
          <CardAction className="text-xs text-muted-foreground tabular-nums">
            {aside}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}

export function AdminDashboard({
  data,
  importModel,
}: {
  data: AdminDashboardData;
  /** The import model picker, shown in the header of the sync panel. */
  importModel?: ReactNode;
}) {
  const courses = data.readiness.find((entry) => entry.kind === "course");
  const thisYear = courses?.years[0];
  const publishedCourses = publishedCourseCount(data);
  const waiting = data.queues.reduce((sum, queue) => sum + queue.count, 0);
  const activeThisWeek = data.users.active.at(-1) ?? 0;
  const publishedTotals = data.publishedCourses.cumulative;
  const publishedThisWeek =
    (publishedTotals.at(-1) ?? 0) - (publishedTotals.at(-2) ?? 0);
  const seltShare =
    data.selt && publishedCourses
      ? data.selt.publishedCourses / publishedCourses
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          href="/admin/users"
          label="Accounts"
          value={formatCount(data.users.total)}
          change={
            data.users.newThisWeek ? `+${data.users.newThisWeek}` : undefined
          }
          detail="Last 12 weeks"
          visual={
            <Sparkline
              baseline="data"
              className="h-12"
              label="Accounts over the last twelve weeks"
              values={data.users.cumulative}
            />
          }
        />
        <KpiTile
          label="Planned this week"
          value={formatCount(activeThisWeek)}
          detail={
            data.users.total
              ? `${Math.round((activeThisWeek / data.users.total) * 100)}% of accounts`
              : "No accounts yet"
          }
          visual={
            <Sparkline
              variant="bar"
              className="h-12"
              label="Students who changed a plan each week"
              values={data.users.active}
            />
          }
        />
        <KpiTile
          href={`/admin/courses/${thisYear?.year ?? ""}`}
          label={`Courses published, ${thisYear?.year ?? ""}`}
          value={formatCount(publishedCourses)}
          change={publishedThisWeek ? `+${publishedThisWeek}` : undefined}
          detail="Last 12 weeks"
          visual={
            <Sparkline
              baseline="data"
              className="h-12"
              label="Published courses over the last twelve weeks"
              values={data.publishedCourses.cumulative}
            />
          }
        />
        {data.selt ? (
          <KpiTile
            href="/admin/selt"
            label="SELT coverage"
            value={`${seltShare === null ? "–" : Math.round(seltShare * 100)}%`}
            detail={`${data.selt.publishedCourses} of ${publishedCourses} courses`}
            visual={
              <ShareRing
                size={48}
                thickness={5}
                values={[{ share: seltShare, tone: "primary" }]}
                label={`SELT reports published for ${data.selt.publishedCourses} of ${publishedCourses} courses`}
              />
            }
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {data.syncs ? (
          <Panel
            title="Catalogue syncs"
            description="Last 30 days"
            aside={importModel}
          >
            <SyncOutcomesChart days={data.syncs} />
          </Panel>
        ) : null}
        <Panel title="Needs attention" aside={`${waiting} waiting`}>
          <AttentionQueues queues={data.queues} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Catalogue readiness">
          <CatalogueReadiness readiness={data.readiness} />
        </Panel>
        {data.changes ? (
          <Panel title="Catalogue changes" aside="Last 6 months">
            <ChangeCalendar days={data.changes} />
          </Panel>
        ) : null}
        <Panel title="Accounts and planning" aside="Last 12 weeks">
          <UserActivityChart users={data.users} />
        </Panel>
        <Panel title="Most planned courses" aside="Students">
          <TopCoursesChart courses={data.topCourses} />
        </Panel>
      </div>
    </div>
  );
}
