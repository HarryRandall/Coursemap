"use client";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@coursemap/ui/primitives/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { ToggleChip } from "@/ui/common/toggle-chip";
import { Command as CommandPrimitive } from "cmdk";
import { CourseToken } from "@/ui/common/course-token";
import { cn } from "@/lib/cn";
import { Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCoursemap } from "@/app/providers";
import type { Course, Term } from "@/lib/coursemap/types";
import { CourseDialog } from "@/ui/overlays/course-dialog";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { SegmentedControl } from "@/ui/common/segmented-control";
import {
  CourseResultSkeleton,
  SearchFailure,
} from "@/ui/overlays/course-result-states";

type CourseSearchResponse = {
  academicYear: number;
  filters: string;
  courses: Course[];
  page: number;
  pageSize: number;
  query: string;
  total: number;
};
function requestKey(
  query: string,
  page: number,
  academicYear: number,
  filters: string,
) {
  return `${academicYear}:${filters}:${query}:${page}`;
}

const LEVELS = [1, 2, 3, 4] as const;

/** "First Semester" as S1, so a row's offerings stay on one line. */
function sessionLabel(session: string) {
  if (/first|semester 1\b/i.test(session)) return "S1";
  if (/second|semester 2\b/i.test(session)) return "S2";
  return session;
}
export function CoursePicker({
  term,
  intent = "all",
  recommendedCodes = [],
  catalogue,
  onClose,
}: {
  term?: Term;
  intent?: "all" | "recommended";
  /** Courses the student's chosen structures still need, shown before a search. */
  recommendedCodes?: string[];
  /** The plan catalogue, so a course opened from the results checks its requisites. */
  catalogue?: PlanCatalogue;
  onClose: () => void;
}) {
  const { state, addCourse, notify } = useCoursemap();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<CourseSearchResponse | null>(null);
  const [previewing, setPreviewing] = useState<Course | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [addingCode, setAddingCode] = useState<string | null>(null);
  // Offered in the destination semester by default; cleared to show any.
  const [session, setSession] = useState(() => term?.name ?? "");
  const [level, setLevel] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<{
    key: string;
    courses: Course[];
  } | null>(null);
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();
  // Under two characters the picker browses the filtered catalogue instead.
  const searchQuery = trimmedQuery.length >= 2 ? trimmedQuery : "";
  const academicYear = term?.year ?? state.profile.catalogueYear;
  const filterKey = `${session}|${level ?? ""}`;
  const currentRequestKey = requestKey(
    searchQuery,
    page,
    academicYear,
    filterKey,
  );
  const recommendationKey = `${academicYear}:${recommendedCodes.join(",")}`;
  const loading = loadingKey === currentRequestKey;
  const failed = failedKey === currentRequestKey;

  useEffect(() => {
    if (!term) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingKey(currentRequestKey);
      setFailedKey(null);
      try {
        const params = new URLSearchParams({
          q: searchQuery,
          ...(searchQuery ? {} : { browse: "1" }),
          page: String(page),
          pageSize: "10",
          year: String(academicYear),
        });
        if (session) params.set("session", session);
        if (level) params.set("level", String(level));
        const result = await fetch(`/api/courses/search?${params}`, {
          signal: controller.signal,
        });
        if (!result.ok) throw new Error("Course search is unavailable");

        const next = (await result.json()) as Omit<
          CourseSearchResponse,
          "academicYear" | "query"
        >;
        if (controller.signal.aborted) return;

        setResponse((current) => {
          const previous =
            page > 1 &&
            current?.query === searchQuery &&
            current.academicYear === academicYear &&
            current.filters === filterKey
              ? current.courses
              : [];
          const courses = [...previous, ...next.courses].filter(
            (course, index, all) =>
              all.findIndex((candidate) => candidate.code === course.code) ===
              index,
          );
          return {
            ...next,
            academicYear,
            filters: filterKey,
            courses,
            query: searchQuery,
          };
        });
      } catch {
        if (!controller.signal.aborted) setFailedKey(currentRequestKey);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingKey((current) =>
            current === currentRequestKey ? null : current,
          );
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    academicYear,
    currentRequestKey,
    filterKey,
    level,
    page,
    retryCount,
    session,
    term,
    searchQuery,
  ]);

  useEffect(() => {
    if (!term || recommendedCodes.length === 0) return;
    if (recommendations?.key === recommendationKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      codes: recommendedCodes.slice(0, 60).join(","),
      year: String(academicYear),
    });
    fetch(`/api/courses/search?${params}`, { signal: controller.signal })
      .then((result) => (result.ok ? result.json() : { courses: [] }))
      .then((next: { courses: Course[] }) => {
        // Keep the requirement order rather than the catalogue's.
        const order = new Map(
          recommendedCodes.map((code, index) => [code, index]),
        );
        setRecommendations({
          key: recommendationKey,
          courses: [...next.courses].sort(
            (left, right) =>
              (order.get(left.code) ?? 0) - (order.get(right.code) ?? 0),
          ),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRecommendations({ key: recommendationKey, courses: [] });
      });
    return () => controller.abort();
  }, [
    academicYear,
    recommendationKey,
    recommendations?.key,
    recommendedCodes,
    term,
  ]);

  const activeResponse =
    response?.query === searchQuery &&
    response.academicYear === academicYear &&
    response.filters === filterKey
      ? response
      : null;
  const browsing = trimmedQuery.length < 2;
  const recommendationsLoading =
    browsing &&
    recommendedCodes.length > 0 &&
    recommendations?.key !== recommendationKey;
  const recommended =
    recommendations?.key === recommendationKey
      ? recommendations.courses.filter(
          (course) =>
            (!session || course.sessions.includes(session)) &&
            (!level || course.level === level * 1000),
        )
      : [];
  // Browsing lists the plan's recommendations first, then the rest of the
  // filtered catalogue; a search lists its matches only.
  const recommendedShown = browsing ? recommended : [];
  const recommendedCodeSet = new Set(
    recommendedShown.map((course) => course.code),
  );
  const results = (activeResponse?.courses ?? []).filter(
    (course) => !recommendedCodeSet.has(course.code),
  );
  const courses = [...recommendedShown, ...results];
  const courseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    state.attempts.forEach((attempt) => {
      counts.set(attempt.courseCode, (counts.get(attempt.courseCode) ?? 0) + 1);
    });
    return counts;
  }, [state.attempts]);

  if (!term) return null;

  const closePicker = () => {
    onClose();
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const choose = async (course: Course) => {
    if (addingCode || (courseCounts.get(course.code) ?? 0) > 0) return;
    setAddingCode(course.code);
    const result = await addCourse(course.code, term.id, course.year);
    notify(
      result.ok
        ? `${course.code} added to ${term.name}${term.year < 2029 ? ` ${term.year}` : ""}`
        : result.message,
      result.ok ? "success" : "warning",
    );
    if (result.ok) closePicker();
    else setAddingCode(null);
  };

  const hasNextPage = Boolean(
    activeResponse &&
    activeResponse.page * activeResponse.pageSize < activeResponse.total,
  );
  const firstPageLoading =
    courses.length === 0 &&
    (recommendationsLoading || (page === 1 && !activeResponse && !failed));
  const firstPageFailed =
    courses.length === 0 && failed && page === 1 && !activeResponse;
  const filtersActive = Boolean(session || level);
  const changeFilters = (next: () => void) => {
    next();
    setPage(1);
    setFailedKey(null);
  };
  const destination = `${term.name}${term.year < 2029 ? ` ${term.year}` : ""}`;

  const retrySearch = () => {
    setFailedKey(null);
    setLoadingKey(currentRequestKey);
    setRetryCount((count) => count + 1);
  };

  const loadNextPage = () => {
    if (loading || failed || !hasNextPage) return;
    const nextPage = page + 1;
    setLoadingKey(requestKey(searchQuery, nextPage, academicYear, filterKey));
    setPage(nextPage);
  };

  const renderCourse = (course: Course) => {
    const inPlan = (courseCounts.get(course.code) ?? 0) > 0;
    const available = course.sessions.includes(term.name);
    const adding = addingCode === course.code;

    return (
      <CommandItem
        key={course.code}
        value={`${course.code} ${course.name} ${course.school}`}
        onSelect={() => setPreviewing(course)}
        title={`Read about ${course.code}`}
        className="group/course min-h-14 cursor-pointer gap-3 rounded-lg px-2"
      >
        <CourseToken code={course.code} accent={course.accent} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {course.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className="font-mono">{course.code}</span>
            <span aria-hidden="true">·</span>
            {course.units} units
            {course.sessions.length > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    !available && "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {available
                    ? course.sessions.map(sessionLabel).join(", ")
                    : `Not in ${term.shortName}`}
                </span>
              </>
            ) : null}
          </span>
        </span>
        {inPlan ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">
            <Check size={13} aria-hidden="true" />
            In plan
          </span>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            tabIndex={-1}
            disabled={Boolean(addingCode)}
            aria-label={`Add ${course.code} to ${term.shortName}`}
            title={`Add to ${term.shortName}`}
            className="shrink-0 transition-colors group-hover/course:border-primary group-hover/course:bg-primary group-hover/course:text-primary-foreground group-data-[selected=true]/course:border-primary/60 hover:border-primary hover:bg-primary hover:text-primary-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void choose(course);
            }}
          >
            {adding ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
          </Button>
        )}
      </CommandItem>
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closePicker();
      }}
    >
      <DialogContent
        className="top-[max(1rem,10dvh)] flex w-[calc(100vw-2rem)] max-w-[40rem] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[40rem]"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openerRef.current?.focus();
        }}
      >
        {/* The destination and search are the header; the title stays for
            screen readers. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Find a course</DialogTitle>
          <DialogDescription>
            {intent === "recommended" ? "Recommended for" : "Add to"}{" "}
            {destination}
          </DialogDescription>
        </DialogHeader>

        {/*
          The search heads one list of results, like Find. Opening a result
          shows the same course view as the plan, with the add action in its
          footer; the row's add button skips that step.
        */}
        <Command
          shouldFilter={false}
          loop
          label="Course catalogue"
          className="flex min-h-0 w-full min-w-0 flex-col bg-transparent"
        >
          {/* The picker's own shortcuts (arrows, Enter) come from the search
              field; keys on the filter chips stay with those chips. */}
          <div
            className="border-b border-border/60"
            onKeyDown={(event) => {
              if (event.target !== inputRef.current) event.stopPropagation();
            }}
          >
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
              <p className="text-xs text-muted-foreground">
                {intent === "recommended" ? "Recommended for" : "Add to"}{" "}
                <span className="font-medium text-foreground">
                  {destination}
                </span>
              </p>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Close"
                >
                  <X aria-hidden="true" size={16} />
                </Button>
              </DialogClose>
            </div>
            <div className="mx-3 flex h-11 items-center gap-3 rounded-lg bg-muted/60 px-3 ring-1 ring-border ring-inset focus-within:ring-ring/60">
              {loading && !firstPageLoading ? (
                <LoaderCircle
                  size={18}
                  aria-label="Searching"
                  className="shrink-0 animate-spin text-muted-foreground"
                />
              ) : (
                <Search
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                />
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                autoFocus
                value={query}
                onValueChange={(value) => {
                  const nextQuery = value.trim();
                  const queryChanged = nextQuery !== trimmedQuery;
                  setQuery(value);
                  if (queryChanged) {
                    setPage(1);
                    setFailedKey(null);
                  }
                }}
                placeholder={`Search ${academicYear} courses by code or name`}
                aria-label={`Search ${academicYear} courses`}
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <div
              role="group"
              aria-label="Filters"
              className="flex items-center gap-2 overflow-x-auto px-4 pt-2.5 pb-3"
            >
              <ToggleChip
                pressed={session === term.name}
                onPressedChange={(pressed) =>
                  changeFilters(() => setSession(pressed ? term.name : ""))
                }
              >
                {session === term.name ? (
                  <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                ) : null}
                Offered in {term.shortName}
              </ToggleChip>
              <SegmentedControl
                label="Level"
                value={level ? String(level) : "any"}
                options={[
                  { value: "any", label: "Any level" },
                  ...LEVELS.map((option) => ({
                    value: String(option),
                    label: `${option}000`,
                  })),
                ]}
                onValueChange={(value) =>
                  changeFilters(() =>
                    setLevel(value === "any" ? null : Number(value)),
                  )
                }
              />
            </div>
          </div>

          <section
            aria-label="Course results"
            className="flex h-[min(28rem,calc(100dvh-max(1rem,10dvh)-12rem))] min-h-0 flex-col"
          >
            <CommandList
              label="Course results"
              className="min-h-0 flex-1 overflow-y-auto p-2"
            >
              {firstPageLoading ? (
                <CourseResultSkeleton />
              ) : firstPageFailed ? (
                <SearchFailure />
              ) : (
                <>
                  <CommandEmpty className="px-6 py-10 text-center text-sm text-muted-foreground">
                    {browsing
                      ? "No courses match these filters."
                      : `No published ${academicYear} courses match ‘${trimmedQuery}’.${
                          filtersActive
                            ? " Try clearing the filters."
                            : " Try a course code such as COMP1100."
                        }`}
                  </CommandEmpty>
                  {recommendedShown.length > 0 ? (
                    <CommandGroup heading="Recommended for your plan">
                      {recommendedShown.map(renderCourse)}
                    </CommandGroup>
                  ) : null}
                  {results.length > 0 ? (
                    <CommandGroup
                      heading={
                        !browsing
                          ? `${activeResponse?.total ?? results.length} results`
                          : session
                            ? `Offered in ${term.shortName}`
                            : "All courses"
                      }
                    >
                      {results.map(renderCourse)}
                    </CommandGroup>
                  ) : null}
                </>
              )}
            </CommandList>

            {hasNextPage && !failed ? (
              <div
                className="shrink-0 border-t border-border/60 p-2"
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={loadNextPage}
                  className="w-full"
                  type="button"
                >
                  {loading ? (
                    <LoaderCircle
                      size={14}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {loading ? "Loading courses" : "Load more courses"}
                </Button>
              </div>
            ) : null}

            {firstPageFailed || (failed && page > 1) ? (
              <div
                className="shrink-0 border-t border-border/60 p-2"
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retrySearch}
                  className="w-full"
                  type="button"
                >
                  {page > 1 ? "Retry loading results" : "Retry search"}
                </Button>
              </div>
            ) : null}
          </section>
        </Command>
        {previewing ? (
          <CourseDialog
            preview={{
              course: previewing,
              addLabel:
                (courseCounts.get(previewing.code) ?? 0) > 0
                  ? "Already in plan"
                  : `Add to ${term.shortName}`,
              onAdd: () => void choose(previewing),
            }}
            catalogue={catalogue}
            onClose={() => setPreviewing(null)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
