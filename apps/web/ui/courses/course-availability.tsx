"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@coursemap/ui/components/badge";
import { sessionLabel } from "@/ui/courses/course-detail-format";
import { StudyPeriodOverflow } from "@/ui/courses/study-period-overflow";

const PERIOD_ORDER: Record<string, number> = {
  "First Semester": 0,
  "Second Semester": 1,
  "Summer Session": 2,
  "Autumn Session": 3,
  "Winter Session": 4,
  "Spring Session": 5,
};

export function CourseAvailability({
  sessions,
}: {
  sessions: readonly string[];
}) {
  const periods = useMemo(
    () =>
      [...new Set(sessions)].sort(
        (left, right) =>
          (PERIOD_ORDER[left] ?? Number.MAX_SAFE_INTEGER) -
            (PERIOD_ORDER[right] ?? Number.MAX_SAFE_INTEGER) ||
          left.localeCompare(right),
      ),
    [sessions],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    function update() {
      if (!container || !measure) return;
      const badges = Array.from(measure.children);
      const gap = Number.parseFloat(getComputedStyle(measure).columnGap) || 4;
      const width = container.getBoundingClientRect().width;
      let used = 0;
      let count = 0;
      for (let index = 0; index < periods.length; index++) {
        used +=
          badges[index].getBoundingClientRect().width + (index > 0 ? gap : 0);
        const remaining = periods.length - index - 1;
        const moreWidth =
          remaining > 0
            ? gap +
              badges[periods.length + remaining - 1].getBoundingClientRect()
                .width
            : 0;
        if (used + moreWidth <= width) count = index + 1;
      }
      setVisibleCount(count);
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [periods]);

  if (periods.length === 0) {
    return (
      <span className="text-[13px] text-muted-foreground/80">Not listed</span>
    );
  }
  const count = Math.min(visibleCount, periods.length);
  const remaining = periods.length - count;

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 py-1"
      aria-label="Available study periods"
    >
      {/* Measure every label without letting it set the table column's width. */}
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-0 overflow-hidden"
      >
        <div ref={measureRef} className="flex w-max gap-1">
          {periods.map((period) => (
            <Badge key={period} variant="outline">
              {sessionLabel(period)}
            </Badge>
          ))}
          {periods.map((period, index) => (
            <Badge key={`more-${period}`} variant="outline">
              +{index + 1}
            </Badge>
          ))}
        </div>
      </div>
      <div data-periods className="flex min-w-0 flex-nowrap items-center gap-1">
        {periods.slice(0, count).map((period) => (
          <Badge key={period} variant="outline">
            {sessionLabel(period)}
          </Badge>
        ))}
        {remaining > 0 && (
          <StudyPeriodOverflow periods={periods.slice(count)} />
        )}
      </div>
    </div>
  );
}
