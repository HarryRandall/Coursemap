"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Course } from "@/lib/coursemap/types";
import { CourseSearchField } from "@/ui/plan/course-search-field";

/** Courses loaded at a time, before "Show 20 more". */
const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 250;

type Loaded = { key: string; courses: Course[]; total: number };

/**
 * The published catalogue for a rule any course fills, such as electives:
 * a page of courses to start, narrowed by a search, with more on request.
 * Courses already in the plan or clashing with it drop out of the list.
 */
export function AnyCourseSearch({
  label,
  academicYear,
  rank,
  renderCourse,
  defaultOpen = false,
  level,
}: {
  /** Course levels to draw on, such as "1-4". Undefined lists every level. */
  level?: string;
  label: string;
  academicYear: number;
  rank: (courses: readonly Course[]) => Course[];
  renderCourse: (course: Course) => ReactNode;
  /**
   * Opens on the list with its search box pinned to the top of the scroll
   * area, where there is room, rather than behind a link.
   */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState(1);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // One letter matches most of the catalogue, so the search starts at two.
  const term = query.trim().length >= 2 ? query.trim() : "";
  const key = `${academicYear}:${level ?? ""}:${term}`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setPending(true);
        setFailed(false);
        const params = new URLSearchParams({
          year: String(academicYear),
          page: String(pages),
          pageSize: String(PAGE_SIZE),
          ...(term ? { q: term } : { browse: "1" }),
          ...(level ? { level } : {}),
        });
        fetch(`/api/courses/search?${params}`, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error("Course search failed.");
            return response.json() as Promise<{
              courses?: Course[];
              total?: number;
            }>;
          })
          .then((payload) =>
            setLoaded((previous) => ({
              key,
              total: payload.total ?? 0,
              courses:
                pages > 1 && previous?.key === key
                  ? [...previous.courses, ...(payload.courses ?? [])]
                  : (payload.courses ?? []),
            })),
          )
          .catch(() => {
            if (!controller.signal.aborted) setFailed(true);
          })
          .finally(() => {
            if (!controller.signal.aborted) setPending(false);
          });
      },
      term && pages === 1 ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, term, pages, academicYear, level, key]);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
      >
        Search all courses
        <ChevronDown size={12} aria-hidden="true" />
      </button>
    );

  const current = loaded?.key === key ? loaded : null;
  const shown = current ? rank(current.courses) : [];
  const more = current
    ? Math.max(0, current.total - current.courses.length)
    : 0;
  return (
    <div className="space-y-1" aria-busy={pending}>
      <div
        className={cn(
          "px-1 pb-1",
          defaultOpen && "sticky top-0 z-10 bg-card pt-2",
        )}
      >
        <CourseSearchField
          label={`Search ${label}`}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPages(1);
          }}
        />
      </div>
      {failed ? (
        <p role="alert" className="px-1 text-[11px] text-muted-foreground">
          Couldn&apos;t load courses. Try again in a moment.
        </p>
      ) : current && shown.length === 0 && !pending ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {term ? "No courses you can add match that." : "No courses to show."}
        </p>
      ) : null}
      {shown.length > 0 ? <ul>{shown.map(renderCourse)}</ul> : null}
      {pending && !current ? (
        <ul aria-hidden="true" className="space-y-1 py-1">
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              className="ml-6 h-7 animate-pulse rounded-md bg-muted/60"
            />
          ))}
        </ul>
      ) : null}
      {more > 0 && !failed ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setPages((value) => value + 1)}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          {pending ? (
            <LoaderCircle
              size={12}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          Show {Math.min(PAGE_SIZE, more)} more
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
