"use client";

import { useEffect, useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import type { Course } from "@/lib/coursemap/types";
import type { TreeContext } from "./requirement-presentation";
import { RequirementCourseRow } from "./requirement-course-row";
import { PlacementControl } from "./placement-control";

type CoursePage = {
  courses: Course[];
  total: number;
  nextCursor: string | null;
};
// Only public catalogue rows are cached. Plan status is read from the current context.
const pages = new Map<string, Promise<CoursePage>>();

function matchingPage(key: string, cursor: string | null) {
  const url = `/api/requirements/courses?${key}&cursor=${cursor ?? "1"}`;
  const cached = pages.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then(async (response) => {
      if (!response.ok)
        throw new Error("Matching courses could not be loaded.");
      return (await response.json()) as CoursePage;
    })
    .catch((error: unknown) => {
      pages.delete(url);
      throw error;
    });
  pages.set(url, pending);
  return pending;
}

export function PaginatedMatchingCourses({
  ruleKey,
  context,
  year,
}: {
  ruleKey: string;
  context: TreeContext;
  year: number;
}) {
  const key = ruleKey;
  const [result, setResult] = useState<CoursePage | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    matchingPage(key, null)
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
  }, [key, retry]);
  async function showMore() {
    if (!key || !result?.nextCursor) return;
    setPending(true);
    setError(false);
    try {
      const page = await matchingPage(key, result.nextCursor);
      setResult({ ...page, courses: [...result.courses, ...page.courses] });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  function retryRequest() {
    if (result) {
      void showMore();
      return;
    }
    setPending(true);
    setError(false);
    setRetry(retry + 1);
  }
  return (
    <div className="space-y-2" aria-busy={pending}>
      {result ? (
        <p className="text-xs text-muted-foreground">
          {result.total} matching {result.total === 1 ? "course" : "courses"}
        </p>
      ) : null}
      {result?.courses.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {result.courses.map((course) => (
            <RequirementCourseRow
              key={course.code}
              code={course.code}
              course={course}
              year={year}
              status={context.attemptStatusByCode.get(course.code) ?? null}
              showStatus={context.showPlanProgress !== false}
              onAdd={context.onAddCourse}
              placement={
                context.placement &&
                context.attemptStatusByCode.has(course.code) ? (
                  <PlacementControl
                    courseCode={course.code}
                    placement={context.placement}
                  />
                ) : undefined
              }
            />
          ))}
        </ul>
      ) : result && !pending ? (
        <p className="text-xs text-muted-foreground">
          No matching courses are published for {year}.
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading matching courses...
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="text-xs">
          Matching courses could not be loaded.{" "}
          <Button variant="ghost" size="sm" onClick={retryRequest}>
            Try again
          </Button>
        </div>
      ) : null}
      {result?.nextCursor && !error ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void showMore()}
        >
          Show {result.total - result.courses.length} more
        </Button>
      ) : null}
    </div>
  );
}
