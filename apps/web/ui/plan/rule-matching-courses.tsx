"use client";
import { useEffect, useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import type { Course } from "@/lib/coursemap/types";
import type { PlanStructureKind } from "@/lib/coursemap/plan-catalogue";
import {
  matchingCoursePage,
  type MatchingCoursePage,
} from "@/ui/requirements/matching-course-pages";
import type { CourseHints, RuleToPlan } from "@/ui/plan/plan-suggestions";
import { CourseRow, type DragStart } from "@/ui/plan/course-row";
import { CourseSearchField } from "@/ui/plan/course-search-field";
import { SUGGESTION_COUNT } from "@/ui/plan/suggested-courses";

const SEARCH_DELAY_MS = 250;

/**
 * The published courses a tag or subject rule matches. It opens on a few
 * suggestions from the first page; searching or showing all reads the rule's
 * courses a page at a time, as rows to drag or add like any listed course.
 * Courses already in the plan leave the list, except when it is read-only.
 */
export function RuleMatchingCourses({
  rule,
  matching,
  kind,
  hints,
  onAdd,
  onOpen,
  onDragStart,
  readOnly,
  expanded = false,
}: {
  rule: RuleToPlan;
  matching: NonNullable<RuleToPlan["matching"]>;
  kind: PlanStructureKind;
  hints?: CourseHints;
  onAdd: (course: Course) => void;
  onOpen: (course: Course) => void;
  onDragStart?: DragStart;
  readOnly: boolean;
  /** Opens on the full list with its search box, where there is room. */
  expanded?: boolean;
}) {
  const [result, setResult] = useState<MatchingCoursePage | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(readOnly || expanded);
  const term = query.trim();
  const pageQuery = term
    ? `${matching.query}&${new URLSearchParams({ q: term })}`
    : matching.query;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setQuery(search),
      search ? SEARCH_DELAY_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    matchingCoursePage(pageQuery, null)
      .then((page) => {
        if (active) {
          setResult(page);
          setError(false);
        }
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
  }, [pageQuery, attempt]);

  const showMore = async () => {
    if (!result?.nextCursor) return;
    setPending(true);
    setError(false);
    try {
      const page = await matchingCoursePage(pageQuery, result.nextCursor);
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

  const loaded = (result?.courses ?? []).filter(
    (course) => readOnly || !matching.statusByCode.has(course.code),
  );
  const listing = showAll || term.length > 0;
  const courses = listing
    ? loaded
    : (hints ? hints.rank(loaded) : loaded).slice(0, SUGGESTION_COUNT);
  const remaining = result ? result.total - result.courses.length : 0;
  return (
    <div aria-busy={pending} className="space-y-1">
      {readOnly || !showAll ? null : (
        <div
          className={
            expanded ? "sticky top-0 z-10 bg-card px-1 pt-2 pb-1" : "px-1 pb-1"
          }
        >
          <CourseSearchField
            label={`Search ${rule.heading}`}
            value={search}
            onChange={setSearch}
          />
        </div>
      )}
      {readOnly || (expanded && !term) ? null : (
        <p className="px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {term ? "Matches" : showAll ? "All courses" : "Suggested"}
        </p>
      )}
      <ul
        className={
          listing && !readOnly && !expanded ? "max-h-72 overflow-y-auto" : ""
        }
      >
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
            prerequisites={hints?.prerequisites(course)}
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
          {term
            ? "No courses match that search"
            : result.total === 0
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
      {!listing && result && result.total > courses.length && !error ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
        >
          Show all {result.total}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      ) : null}
      {listing && result?.nextCursor && !error ? (
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
          Show {Math.min(remaining, 12)} more
        </button>
      ) : null}
    </div>
  );
}
