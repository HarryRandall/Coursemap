"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import {
  matchingCoursePage,
  type MatchingCoursePage,
} from "@/ui/requirements/matching-course-pages";
import type { RuleToPlan } from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";

/**
 * The published courses a tag or subject rule matches, a page at a time, as
 * rows to drag or add like any listed course. Courses already in the plan
 * leave the list, except when it is read-only.
 */
export function RuleMatchingCourses({
  rule,
  matching,
  kind,
  onAdd,
  onOpen,
  onDragStart,
  readOnly,
}: {
  rule: RuleToPlan;
  matching: NonNullable<RuleToPlan["matching"]>;
  kind: PlanStructureKind;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart: DragStart;
  readOnly: boolean;
}) {
  const [result, setResult] = useState<MatchingCoursePage | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    matchingCoursePage(matching.query, null)
      .then((page) => {
        if (active) setResult(page);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [matching.query, attempt]);

  const showMore = async () => {
    if (!result?.nextCursor) return;
    setPending(true);
    setError(false);
    try {
      const page = await matchingCoursePage(matching.query, result.nextCursor);
      setResult({ ...page, courses: [...result.courses, ...page.courses] });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const retry = () => {
    if (result) return void showMore();
    setPending(true);
    setError(false);
    setAttempt((value) => value + 1);
  };

  const courses = (result?.courses ?? []).filter(
    (course) => readOnly || !matching.statusByCode.has(course.code),
  );
  const remaining = result ? result.total - result.courses.length : 0;
  return (
    <div aria-busy={pending}>
      <ul>
        {courses.map((course) => (
          <CourseRow
            key={course.code}
            item={{
              course,
              required: false,
              tag: rule.heading,
              structureKind: kind,
            }}
            status={matching.statusByCode.get(course.code) ?? null}
            readOnly={readOnly}
            onAdd={onAdd}
            onOpen={onOpen}
            onDragStart={onDragStart}
          />
        ))}
      </ul>
      {pending && !result ? (
        <ul aria-hidden="true" className="space-y-1 py-1">
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              className="ml-6 h-7 animate-pulse rounded-md bg-muted/60"
            />
          ))}
        </ul>
      ) : null}
      {result && !pending && courses.length === 0 && !error ? (
        <p className="px-1 py-1.5 pl-7 text-[12px] text-muted-foreground">
          {result.total === 0
            ? "No published courses match this yet"
            : "Every matching course is already in your plan"}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="px-1 py-1.5 pl-7 text-[12px] text-muted-foreground"
        >
          Couldn&apos;t load matching courses.{" "}
          <button
            type="button"
            className="cursor-pointer font-medium text-primary hover:underline"
            onClick={retry}
          >
            Try again
          </button>
        </p>
      ) : null}
      {result?.nextCursor && !error ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void showMore()}
          className="ml-6 flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-[12px] font-medium text-primary transition hover:underline disabled:cursor-default disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle
              size={12}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          Show {remaining} more
        </button>
      ) : null}
    </div>
  );
}
