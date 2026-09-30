import { Badge } from "@coursemap/ui/components/badge";
import { sessionLabel } from "@/ui/courses/course-detail-format";

const PERIOD_ORDER: Record<string, number> = {
  "First Semester": 0,
  "Second Semester": 1,
  "Summer Session": 2,
  "Autumn Session": 3,
  "Winter Session": 4,
  "Spring Session": 5,
};

function PeriodBadges({ periods }: { periods: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {periods.map((period) => (
        <Badge key={period} variant="outline">
          {sessionLabel(period)}
        </Badge>
      ))}
    </div>
  );
}

export function CourseAvailability({
  sessions,
}: {
  sessions: readonly string[];
}) {
  const periods = [...new Set(sessions)].sort(
    (left, right) =>
      (PERIOD_ORDER[left] ?? Number.MAX_SAFE_INTEGER) -
        (PERIOD_ORDER[right] ?? Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right),
  );
  const semesters = periods.filter(
    (period) => (PERIOD_ORDER[period] ?? Number.MAX_SAFE_INTEGER) < 2,
  );
  const others = periods.filter(
    (period) => (PERIOD_ORDER[period] ?? Number.MAX_SAFE_INTEGER) >= 2,
  );

  if (periods.length === 0) {
    return (
      <span className="text-[13px] text-muted-foreground/80">Not listed</span>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 py-1"
      aria-label="Available study periods"
    >
      {semesters.length > 0 ? <PeriodBadges periods={semesters} /> : null}
      {others.length > 0 ? <PeriodBadges periods={others} /> : null}
    </div>
  );
}
