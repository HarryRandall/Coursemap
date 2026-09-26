"use client";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@coursemap/ui/primitives/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { YearPicker } from "@/ui/common/year-picker";
import { FilterBar } from "@/ui/common/filter-bar";
import { CourseToken } from "@/ui/common/course-token";
import { cn } from "@/lib/cn";
import { ChevronRight, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCoursemap } from "@/app/providers";
import type { Course, Term } from "@/lib/coursemap/types";
import { CoursePreview } from "@/ui/overlays/course-preview";
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
export function CoursePicker({
  term,
  intent = "all",
  academicYears = [],
  recommendedCodes = [],
  onClose,
}: {
  term?: Term;
  intent?: "all" | "recommended";
  academicYears?: number[];
  /** Courses the student's chosen structures still need, shown before a search. */
  recommendedCodes?: string[];
  onClose: () => void;
}) {
  const { state, addCourse, notify } = useCoursemap();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<CourseSearchResponse | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [addingCode, setAddingCode] = useState<string | null>(null);
  // Offered in the destination semester by default; cleared to show any.
  const [session, setSession] = useState(() =>
    term && term.id !== "unscheduled" ? term.name : "",
  );
  const [level, setLevel] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<{
    key: string;
    courses: Course[];
  } | null>(null);
  const selectableAcademicYears = useMemo(
    () =>
      [
        ...new Set(
          academicYears.length > 0
            ? academicYears
            : [state.profile.catalogueYear],
        ),
      ].sort((left, right) => left - right),
    [academicYears, state.profile.catalogueYear],
  );
  const [unscheduledAcademicYear, setUnscheduledAcademicYear] = useState(() =>
    selectableAcademicYears.includes(state.profile.catalogueYear)
      ? state.profile.catalogueYear
      : (selectableAcademicYears[0] ?? state.profile.catalogueYear),
  );
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const trimmedQuery = query.trim();
  const academicYear =
    term?.id === "unscheduled"
      ? unscheduledAcademicYear
      : (term?.year ?? state.profile.catalogueYear);
  const sessionFilter = term?.id === "unscheduled" ? "" : session;
  const filterKey = `${sessionFilter}|${level ?? ""}`;
  const currentRequestKey = requestKey(
    trimmedQuery,
    page,
    academicYear,
    filterKey,
  );
  const recommendationKey = `${academicYear}:${recommendedCodes.join(",")}`;
  const loading = loadingKey === currentRequestKey;
  const failed = failedKey === currentRequestKey;

  useEffect(() => {
    if (!term || trimmedQuery.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingKey(currentRequestKey);
      setFailedKey(null);
      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          page: String(page),
          pageSize: "10",
          year: String(academicYear),
        });
        if (sessionFilter) params.set("session", sessionFilter);
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
            current?.query === trimmedQuery &&
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
            query: trimmedQuery,
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
    sessionFilter,
    term,
    trimmedQuery,
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
    response?.query === trimmedQuery &&
    response.academicYear === academicYear &&
    response.filters === filterKey &&
    trimmedQuery.length >= 2
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
            (!sessionFilter || course.sessions.includes(sessionFilter)) &&
            (!level || course.level === level * 1000),
        )
      : [];
  const courses = browsing ? recommended : (activeResponse?.courses ?? []);
  const showPrompt =
    browsing &&
    !recommendationsLoading &&
    (recommendations?.courses.length ?? 0) === 0;
  const selected =
    courses.find((course) => course.code === selectedCode) ??
    courses[0] ??
    null;

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
  const firstPageLoading = browsing
    ? recommendationsLoading
    : page === 1 && !activeResponse && !failed;
  const firstPageFailed = !browsing && failed && page === 1 && !activeResponse;
  const filtersActive = Boolean(sessionFilter || level);
  const changeFilters = (next: () => void) => {
    next();
    setPage(1);
    setSelectedCode(null);
    setMobilePreviewOpen(false);
    setFailedKey(null);
  };
  const destination = `${term.name}${term.year < 2029 ? ` ${term.year}` : ""}`;

  const previewCourse = (courseCode: string) => {
    setSelectedCode(courseCode);
    setMobilePreviewOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) {
      window.requestAnimationFrame(() => backButtonRef.current?.focus());
    }
  };

  const showResults = () => {
    setMobilePreviewOpen(false);
    window.requestAnimationFrame(() =>
      searchAreaRef.current
        ?.querySelector<HTMLInputElement>('input[type="search"]')
        ?.focus(),
    );
  };

  const retrySearch = () => {
    setFailedKey(null);
    setLoadingKey(currentRequestKey);
    setRetryCount((count) => count + 1);
  };

  const loadNextPage = () => {
    if (loading || failed || !hasNextPage) return;
    const nextPage = page + 1;
    setLoadingKey(requestKey(trimmedQuery, nextPage, academicYear, filterKey));
    setPage(nextPage);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closePicker();
      }}
    >
      <DialogContent
        className="max-w-[56rem]"
        showCloseButton
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openerRef.current?.focus();
        }}
      >
        {/* The search bar is the header. The title and destination stay for
            screen readers; the add button names the semester. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Find a course</DialogTitle>
          <DialogDescription>
            {intent === "recommended" ? "Recommended for" : "Add to"}{" "}
            {destination}
          </DialogDescription>
        </DialogHeader>

        {/*
          The search bar spans the dialog; below it the results list and the
          selected-course preview sit side by side on wide screens and swap
          in place on narrow ones. The body height is fixed so the dialog does
          not jump as results load.
        */}
        <Command
          shouldFilter={false}
          loop
          label="Course catalogue"
          className="min-h-0 bg-transparent"
        >
          {/* The picker's own shortcuts (arrows, Enter) come from the search
              field; keys inside the filter menus stay with those menus. */}
          <div
            ref={searchAreaRef}
            className="flex items-start gap-2 border-b border-border/60 py-3 pr-12 pl-3"
            onKeyDown={(event) => {
              if (
                !(event.target instanceof HTMLInputElement) ||
                event.target.type !== "search"
              )
                event.stopPropagation();
            }}
          >
            <div className="min-w-0 flex-1">
              <FilterBar
                autoFocus
                searchPlaceholder={`Search ${academicYear} courses by code or name`}
                filters={[
                  ...(term.id !== "unscheduled"
                    ? [
                        {
                          key: "session",
                          label: "Offered in",
                          allLabel: "Any semester",
                          options: [
                            { value: term.name, label: term.shortName },
                          ],
                        },
                      ]
                    : []),
                  {
                    key: "level",
                    label: "Level",
                    allLabel: "Any level",
                    options: LEVELS.map((option) => ({
                      value: String(option),
                      label: `Level ${option}`,
                    })),
                  },
                ]}
                state={{
                  query,
                  values: { session, level: level ? String(level) : "" },
                  onQueryChange: (value) => {
                    const nextQuery = value.trim();
                    const queryChanged = nextQuery !== trimmedQuery;
                    setQuery(value);
                    if (queryChanged) {
                      setPage(1);
                      setSelectedCode(null);
                      setMobilePreviewOpen(false);
                      setFailedKey(null);
                    }
                  },
                  onFilterChange: (key, value) =>
                    changeFilters(() => {
                      if (key === "session") setSession(value);
                      if (key === "level")
                        setLevel(value ? Number(value) : null);
                    }),
                }}
              />
            </div>
            {term.id === "unscheduled" ? (
              <YearPicker
                ariaLabel="Course year"
                years={selectableAcademicYears}
                value={academicYear}
                onChange={(year) => {
                  if (year === "all" || !selectableAcademicYears.includes(year))
                    return;
                  setUnscheduledAcademicYear(year);
                  setPage(1);
                  setResponse(null);
                  setSelectedCode(null);
                  setMobilePreviewOpen(false);
                  setFailedKey(null);
                }}
              />
            ) : null}
          </div>

          <div className="grid h-[clamp(16rem,calc(100dvh-16rem),30rem)] min-h-0 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {showPrompt ? (
              <CommandList
                label="Course results"
                className="col-span-full max-h-none overflow-hidden !p-0"
              >
                <Empty className="h-full !rounded-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>Type a course code or name</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </CommandList>
            ) : (
              <section
                aria-label="Course results"
                className={cn(
                  "min-h-0 border-border/60 md:border-r",
                  mobilePreviewOpen
                    ? "hidden md:flex md:flex-col"
                    : "flex flex-col",
                )}
              >
                <CommandList label="Course results" className="min-h-0 flex-1">
                  {firstPageLoading ? (
                    <CourseResultSkeleton />
                  ) : firstPageFailed ? (
                    <SearchFailure />
                  ) : (
                    <>
                      <CommandEmpty className="px-6 py-10 text-center text-sm text-muted-foreground">
                        {browsing
                          ? "No recommended courses match these filters."
                          : `No published ${academicYear} courses match ‘${trimmedQuery}’.${
                              filtersActive
                                ? " Try clearing the filters."
                                : " Try a course code such as COMP1100."
                            }`}
                      </CommandEmpty>
                      {courses.length > 0 ? (
                        <CommandGroup
                          heading={
                            browsing
                              ? "Recommended for your plan"
                              : `${activeResponse?.total ?? courses.length} results`
                          }
                        >
                          {courses.map((course) => {
                            const inPlan =
                              (courseCounts.get(course.code) ?? 0) > 0;
                            const available =
                              course.sessions.includes(term.name) ||
                              term.id === "unscheduled";

                            return (
                              <CommandItem
                                key={course.code}
                                value={`${course.code} ${course.name} ${course.school}`}
                                data-previewed={selectedCode === course.code}
                                onSelect={() => previewCourse(course.code)}
                                className="data-[previewed=true]:bg-primary/10 data-[previewed=true]:ring-1 data-[previewed=true]:ring-primary/20 data-[previewed=true]:ring-inset"
                              >
                                <CourseToken
                                  code={course.code}
                                  accent={course.accent}
                                  size="sm"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-foreground">
                                    {course.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    <span className="font-mono">
                                      {course.code}
                                    </span>{" "}
                                    · {course.school}
                                  </span>
                                </span>
                                {inPlan ? (
                                  <Badge
                                    className="px-2 py-0.5"
                                    variant="primary-light"
                                  >
                                    In plan
                                  </Badge>
                                ) : !available ? (
                                  <Badge
                                    className="px-2 py-0.5"
                                    variant={badgeVariantForTone.warning}
                                  >
                                    Not offered in {term.shortName}
                                  </Badge>
                                ) : null}
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {course.units}u
                                </span>
                                <CommandShortcut
                                  aria-hidden="true"
                                  className="md:hidden"
                                >
                                  <ChevronRight size={15} />
                                </CommandShortcut>
                              </CommandItem>
                            );
                          })}
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
            )}

            {!showPrompt ? (
              <CoursePreview
                course={selected}
                term={term}
                inPlan={
                  selected ? (courseCounts.get(selected.code) ?? 0) > 0 : false
                }
                adding={addingCode === selected?.code}
                mobileOpen={mobilePreviewOpen}
                backButtonRef={backButtonRef}
                onBack={showResults}
                onAdd={() => {
                  if (selected) void choose(selected);
                }}
              />
            ) : null}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
