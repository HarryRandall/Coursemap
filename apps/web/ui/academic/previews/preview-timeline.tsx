import { formatPreviewMark } from "@/lib/academic/preview-metrics";
import { Card } from "@coursemap/ui/primitives/card";
import { BookCheck, ChevronDown } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyMedia,
} from "@coursemap/ui/primitives/empty";
import { cn } from "@/lib/cn";
import { PreviewCourseRow } from "./preview-course-row";
import { PreviewGrade } from "./preview-grade";
import {
  averageMark,
  hasResult,
  periods,
  shortPeriod,
  type PreviewCourse,
} from "./preview-data";

export function PreviewTimeline({
  courses,
  design,
  onSelect,
  onAction,
  live = false,
}: {
  courses: PreviewCourse[];
  design: string;
  live?: boolean;
  onSelect: (code: string) => void;
  onAction?: (code: string, action: "clear" | "remove") => void;
}) {
  const timelinePeriods = live
    ? [
        ...new Map(
          courses.map((course) => [
            course.term,
            { value: course.term, label: course.termLabel ?? course.term },
          ]),
        ).values(),
      ].sort(
        (a, b) =>
          Number(
            courses.some((course) => course.term === b.value && course.current),
          ) -
            Number(
              courses.some(
                (course) => course.term === a.value && course.current,
              ),
            ) || b.value.localeCompare(a.value),
      )
    : periods;
  const groups = timelinePeriods.flatMap((period) => {
    const items = courses
      .filter((course) => course.term === period.value)
      .sort(
        (left, right) => Number(hasResult(left)) - Number(hasResult(right)),
      );
    return items.length ? [{ ...period, items }] : [];
  });
  if (!groups.length)
    return (
      <Empty className="rounded-xl border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookCheck aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No results yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div
      className={cn(
        design === "2"
          ? "overflow-hidden rounded-xl border bg-card"
          : "space-y-3",
      )}
    >
      {groups.map((group) => {
        const current = live
          ? group.items.some((course) => course.current)
          : group.value === "2026-s2";
        const results = group.items.filter(
          (course) => course.mark !== undefined,
        );
        const heading = (
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">
                {live ? group.label : shortPeriod(group.value)}
              </h3>
              {current ? (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Current
                </span>
              ) : null}
            </div>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {results.length ? (
                <>
                  <span className="tabular-nums">
                    {formatPreviewMark(Number(averageMark(results)))}%
                  </span>
                  <PreviewGrade mark={Number(averageMark(results))} />
                </>
              ) : (
                `${group.items.length} ${group.items.length === 1 ? "course" : "courses"}`
              )}
            </span>
          </>
        );
        const rows = (
          <>
            {group.items.map((course) => (
              <PreviewCourseRow
                key={course.id ?? course.code}
                course={course}
                compact={design === "2"}
                onSelect={onSelect}
                onAction={onAction}
              />
            ))}
          </>
        );
        if (design === "3")
          return (
            <details
              key={group.value}
              open={current}
              className="group overflow-hidden rounded-xl border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 p-5 [&::-webkit-details-marker]:hidden">
                {heading}
                <ChevronDown
                  aria-hidden="true"
                  size={16}
                  className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t">{rows}</div>
            </details>
          );
        if (design === "2")
          return (
            <section key={group.value}>
              <header className="flex items-center gap-3 border-b bg-muted/40 px-5 py-3">
                {heading}
              </header>
              {rows}
            </section>
          );
        return (
          <section key={group.value} className="space-y-3">
            <header className="flex items-center gap-3">{heading}</header>
            <Card className="gap-0 overflow-hidden py-0">{rows}</Card>
          </section>
        );
      })}
    </div>
  );
}
