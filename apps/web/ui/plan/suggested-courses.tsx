"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import { CourseSearchField } from "@/ui/plan/course-search-field";

/** Suggestions shown before a long list opens in full. */
export const SUGGESTION_COUNT = 3;
/** Courses an expanded list shows at a time, each "Show more" adding as many again. */
const EXPANDED_PAGE = 20;

/**
 * A long list of courses as a few suggestions, opening to every course with
 * a search box. Courses arrive ranked; `suggested` picks the few shown
 * first when another group has already suggested some of the best.
 */
export function SuggestedCourses({
  label,
  courses,
  suggested,
  renderCourse,
  expanded = false,
}: {
  /**
   * Shows the search box, pinned to the top of the scroll area, and twenty
   * courses at a time, where there is room for them, instead of a few
   * suggestions.
   */
  expanded?: boolean;
  /** The rule, for the search box's accessible name. */
  label: string;
  courses: readonly Course[];
  suggested?: readonly string[];
  renderCourse: (course: Course) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(EXPANDED_PAGE);
  const searching = showAll || expanded;
  const needle = searching ? query.trim().toLowerCase() : "";
  const matches = needle
    ? courses.filter((course) =>
        `${course.code} ${course.name}`.toLowerCase().includes(needle),
      )
    : null;
  const picked = suggested
    ? courses.filter((course) => suggested.includes(course.code))
    : [];
  const shown =
    matches ??
    (showAll
      ? courses
      : expanded
        ? courses.slice(0, limit)
        : picked.length > 0
          ? picked
          : courses.slice(0, SUGGESTION_COUNT));
  return (
    <div className="space-y-1">
      {searching ? (
        <div
          className={cn(
            "px-1 pb-1",
            expanded && "sticky top-0 z-10 bg-card pt-2",
          )}
        >
          <CourseSearchField
            label={`Search ${label}`}
            value={query}
            onChange={setQuery}
          />
        </div>
      ) : null}
      {expanded && !matches ? null : (
        <p className="px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {matches
            ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
            : showAll
              ? "All courses"
              : "Suggested"}
        </p>
      )}
      <ul
        className={cn(
          !expanded && (showAll || matches) && "max-h-72 overflow-y-auto",
        )}
      >
        {shown.map(renderCourse)}
      </ul>
      {!matches && expanded && courses.length > shown.length ? (
        <button
          type="button"
          onClick={() => setLimit((value) => value + EXPANDED_PAGE)}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
        >
          Show {Math.min(EXPANDED_PAGE, courses.length - shown.length)} more
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      ) : !matches && courses.length > shown.length ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
        >
          Show all {courses.length}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      ) : !matches && showAll && !expanded ? (
        <button
          type="button"
          onClick={() => {
            setShowAll(false);
            setQuery("");
          }}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
        >
          Show suggestions
          <ChevronDown size={12} aria-hidden="true" className="rotate-180" />
        </button>
      ) : null}
    </div>
  );
}
