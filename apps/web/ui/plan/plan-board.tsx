"use client";
import { useReturnFocus } from "@/hooks/use-return-focus";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  GripVertical,
  Plus,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";
import { useCoursemap } from "@/app/providers";
import { AppShell } from "@/ui/shell";
import { OnboardingPrompt } from "@/ui/common/onboarding-prompt";
import { CourseDialog, CoursePicker } from "@/ui/overlays";
import { Button } from "@coursemap/ui/primitives/button";
import { FixIssueButton } from "@/ui/plan/fix-issue-button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import { YearTabs, type YearTab } from "@/ui/plan/year-tabs";
import { CoursesToPlan } from "@/ui/plan/courses-to-plan";
import {
  courseForTerm,
  coursesToPlan,
  rulesToPlanCount,
  type CourseToPlan,
  type PlannedStructure,
} from "@/ui/plan/plan-suggestions";
import {
  attemptStatusByCode,
  planTreeContext,
} from "@/ui/requirements/plan-tree-context";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { recommendedCourseCodes } from "@/lib/coursemap/requirement-display";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import {
  STANDARD_COURSE_SLOTS,
  STANDARD_TERM_UNITS,
  courseIsAvailable,
  effectiveStatus,
  missingPrereqs,
  planningCourseForAttempt,
  unitsForAttempt,
  type EffectiveStatus,
} from "@/lib/planner";

export type Entry = {
  attempt: Attempt;
  course: Course;
  status: EffectiveStatus;
};
export type PendingDrop = {
  attemptId: string;
  termId: string;
  beforeAttemptId?: string;
};
export type DragPointer = {
  initialX: number;
  initialY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  rowHeight: number;
};
export type PickerState = { termId: string; intent: "all" | "recommended" };

/** Drag ids for suggested courses, which have no attempt yet. */
const SUGGESTION_DRAG = "suggestion:";
export /** Single muted status mark - the only colour on the board. */
function StatusMark({
  status,
  size = 15,
}: {
  status: EffectiveStatus;
  size?: number;
}) {
  if (status === "completed")
    return <CheckCircle2 size={size} className="shrink-0 text-emerald-500" />;
  if (status === "failed")
    return <XCircle size={size} className="shrink-0 text-rose-500" />;
  if (status === "blocked" || status === "approval")
    return <AlertTriangle size={size} className="shrink-0 text-amber-500" />;
  return <Circle size={size} className="shrink-0 text-muted-foreground/40" />;
}
export function PlanBoard({ catalogue }: { catalogue: PlanCatalogue }) {
  const overloadFocus = useReturnFocus();
  const { state, reorderAttempt, addCourse, setPlacement, notify } =
    useCoursemap();
  const [selectedYearKey, setSelectedYearKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fetchedCourses, setFetchedCourses] = useState<Course[]>([]);
  const [draggedSuggestion, setDraggedSuggestion] =
    useState<CourseToPlan | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [overloadTerm, setOverloadTerm] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<PendingDrop | null>(null);
  const [dragPointer, setDragPointer] = useState<DragPointer | null>(null);
  const dragPreviewRef = useRef<PendingDrop | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const floatingCardRef = useRef<HTMLDivElement | null>(null);
  const draggedSuggestionRef = useRef<CourseToPlan | null>(null);
  const hoverTabRef = useRef<string | undefined>(undefined);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);

  const degree = catalogue.degrees.find(
    (item) => item.code === state.profile.degreeCode,
  );
  const timelineDegree = degree ?? undefined;
  const degreeYears = useMemo(
    () =>
      planTimelineYears({
        degree: timelineDegree,
        commencementYear: state.profile.commencementYear,
        extensionYears: state.profile.extensionYears,
      }),
    [
      state.profile.commencementYear,
      state.profile.extensionYears,
      timelineDegree,
    ],
  );
  const timelineTerms = useMemo(
    () => planTimelineTerms({ terms: catalogue.terms, years: degreeYears }),
    [catalogue.terms, degreeYears],
  );
  const planningCatalogue = useMemo(
    () => ({ ...catalogue, terms: timelineTerms }),
    [catalogue, timelineTerms],
  );
  const recommendedCodes = useMemo(
    () => recommendedCourseCodes(catalogue, state.profile, state.attempts),
    [catalogue, state.profile, state.attempts],
  );
  const pickerTerm = picker
    ? timelineTerms.find((term) => term.id === picker.termId)
    : undefined;
  useEffect(
    () => () => {
      pointerCleanupRef.current?.();
    },
    [],
  );

  const entriesFor = (termId: string): Entry[] =>
    state.attempts
      .filter(
        (attempt) =>
          attempt.termId === termId && attempt.status !== "withdrawn",
      )
      .map((attempt) => {
        const course = planningCourseForAttempt(attempt, planningCatalogue);
        return course
          ? {
              attempt,
              course,
              status: effectiveStatus(
                attempt,
                state.attempts,
                planningCatalogue,
              ),
            }
          : null;
      })
      .filter((entry): entry is Entry => Boolean(entry));

  const unitsOf = (entries: Entry[]) =>
    entries.reduce(
      (total, entry) =>
        total +
        (entry.status === "failed"
          ? 0
          : unitsForAttempt(entry.attempt, entry.course)),
      0,
    );

  const hasRoom = (term: Term) =>
    term.id === "unscheduled" ||
    entriesFor(term.id).length < STANDARD_COURSE_SLOTS;
  const termsFor = (key: string) =>
    timelineTerms.filter((term) =>
      key === "later"
        ? term.id === "unscheduled"
        : term.id !== "unscheduled" && String(term.year) === key,
    );
  const yearTabs: YearTab[] = [
    ...[
      ...new Set(
        timelineTerms
          .filter((term) => term.id !== "unscheduled")
          .map((term) => term.year),
      ),
    ].map((year) => {
      const terms = termsFor(String(year));
      const entries = terms.flatMap((term) => entriesFor(term.id));
      return {
        key: String(year),
        label: `Year ${Math.max(1, year - state.profile.commencementYear + 1)}`,
        detail: String(year),
        units: unitsOf(entries),
        target: terms.length * STANDARD_TERM_UNITS,
        finished:
          entries.length > 0 &&
          entries.every((entry) => entry.attempt.status === "completed"),
      };
    }),
    ...(timelineTerms.some((term) => term.id === "unscheduled")
      ? [
          {
            key: "later",
            label: "Later",
            detail: "Not scheduled",
            units: unitsOf(entriesFor("unscheduled")),
            target: 0,
            finished: false,
          },
        ]
      : []),
  ];
  // Opens on the first year with room that is not already behind the
  // student, so the page starts where there is planning to do.
  const selectedYear =
    yearTabs.find((year) => year.key === selectedYearKey) ??
    yearTabs.find(
      (year) =>
        year.key !== "later" &&
        !year.finished &&
        termsFor(year.key).some(hasRoom),
    ) ??
    yearTabs.find((year) => !year.finished) ??
    yearTabs[0];
  const selectedTerms = selectedYear ? termsFor(selectedYear.key) : [];

  const requestAddSuggested = async (picked: Course, term: Term) => {
    const course =
      courseForTerm(picked.code, term, planningCatalogue) ?? picked;
    if (
      term.id !== "unscheduled" &&
      course.sessions.length > 0 &&
      !courseIsAvailable(course, term.name)
    ) {
      notify(
        `${course.code} is not offered in ${term.name}. It runs in ${course.sessions.join(" and ")}.`,
        "warning",
      );
      return;
    }
    const entries = entriesFor(term.id);
    if (
      term.id !== "unscheduled" &&
      (entries.length >= STANDARD_COURSE_SLOTS ||
        unitsOf(entries) + course.units > 24)
    ) {
      notify(
        `${term.name} ${term.year} is full. Use Add course on the semester to overload it.`,
        "warning",
      );
      return;
    }
    const result = await addCourse(course.code, term.id, course.year);
    notify(
      result.ok
        ? `${course.code} added to ${term.id === "unscheduled" ? "Later" : `${term.name} ${term.year}`}`
        : result.message,
      result.ok ? "success" : "warning",
    );
  };

  const offeredIn = (picked: Course, term: Term) => {
    const course =
      courseForTerm(picked.code, term, planningCatalogue) ?? picked;
    return (
      term.id === "unscheduled" ||
      course.sessions.length === 0 ||
      courseIsAvailable(course, term.name)
    );
  };
  const addToSelectedYear = (course: Course) => {
    const term =
      selectedTerms.find((item) => hasRoom(item) && offeredIn(course, item)) ??
      selectedTerms.find((item) => offeredIn(course, item));
    if (!term) {
      notify(
        `${course.code} does not run in ${selectedYear?.label ?? "this year"}'s semesters.`,
        "warning",
      );
      return;
    }
    void requestAddSuggested(course, term);
  };

  const statuses = attemptStatusByCode(state.attempts);
  const selectedStructures = [
    { code: state.profile.degreeCode, kind: "programme" as const },
    { code: state.profile.majorCode, kind: "major" as const },
    ...(state.profile.minorCodes ?? []).map((code) => ({
      code,
      kind: "minor" as const,
    })),
    ...(state.profile.specialisationCodes ?? []).map((code) => ({
      code,
      kind: "specialisation" as const,
    })),
  ].filter((item): item is { code: string; kind: typeof item.kind } =>
    Boolean(item.code),
  );
  const selectedStructureCodes = new Set(
    selectedStructures.map((item) => item.code),
  );
  const structures: PlannedStructure[] = selectedStructures.flatMap(
    ({ code, kind }) => {
      const requirements = catalogue.structureRequirements.find(
        (item) => item.structureCode === code && item.structureKind === kind,
      );
      if (!requirements?.root) return [];
      return [
        {
          code,
          kind,
          name:
            kind === "programme"
              ? (degree?.name ?? requirements.structureName)
              : requirements.structureName,
          root: requirements.root,
          context: planTreeContext({
            structureCode: code,
            root: requirements.root,
            catalogue: planningCatalogue,
            attempts: state.attempts,
            placements: state.placements ?? [],
            statuses,
            selectedStructureCodes,
            unitTarget: kind === "programme" ? (degree?.units ?? null) : null,
            onPlace: (courseCode, placement) => {
              void setPlacement(courseCode, placement).then((result) => {
                if (!result.ok) notify(result.message, "warning");
              });
            },
            onAddCourse: addToSelectedYear,
          }),
        },
      ];
    },
  );
  const toPlan = coursesToPlan({
    structures,
    attempts: state.attempts,
    catalogue: planningCatalogue,
  });

  // Starred courses the planner has not loaded are fetched by code.
  const findCourse = (code: string) =>
    planningCatalogue.courses.find(
      (course) =>
        course.code === code && course.year === catalogue.academicYear,
    ) ??
    planningCatalogue.courses.find((course) => course.code === code) ??
    fetchedCourses.find((course) => course.code === code);
  const starredCodes = state.starredCourses ?? [];
  const missingStarred = starredCodes
    .filter((code) => !findCourse(code))
    .join(",");
  useEffect(() => {
    if (!missingStarred || catalogue.academicYear === null) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      codes: missingStarred,
      year: String(catalogue.academicYear),
    });
    fetch(`/api/courses/search?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { courses?: Course[] } | null) => {
        const loaded = payload?.courses ?? [];
        setFetchedCourses((current) => [
          ...current,
          ...loaded.filter(
            (course) => !current.some((item) => item.code === course.code),
          ),
        ]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [missingStarred, catalogue.academicYear]);
  const inPlan = new Set(
    state.attempts
      .filter((attempt) => attempt.status !== "withdrawn")
      .map((attempt) => attempt.courseCode),
  );
  const starred: CourseToPlan[] = starredCodes.flatMap((code) => {
    const course = inPlan.has(code) ? undefined : findCourse(code);
    return course
      ? [
          {
            course,
            required: false,
            tag: "Starred",
            structureKind: "programme" as const,
          },
        ]
      : [];
  });

  const issueNote = (entry: Entry) => {
    if (entry.status === "blocked") {
      const missing = missingPrereqs(
        entry.attempt,
        state.attempts,
        planningCatalogue,
      );
      return `Needs ${missing.join(" + ")} completed or scheduled earlier`;
    }
    if (entry.status === "approval") return "Convener permission is required";
    if (entry.status === "failed") return "Failed attempt with 0 units earned";
    return null;
  };

  const applyDrop = async ({
    attemptId,
    termId,
    beforeAttemptId,
  }: PendingDrop) => {
    const attempt = state.attempts.find((item) => item.id === attemptId);
    if (!attempt || attemptId === beforeAttemptId) return;
    const originalTermId = attempt.termId;
    const result = await reorderAttempt(attemptId, termId, beforeAttemptId);
    const term = timelineTerms.find((item) => item.id === termId);
    const termLabel = [term?.name, term?.year].filter(Boolean).join(" ");
    notify(
      result.ok
        ? originalTermId === termId
          ? `${attempt.courseCode} reordered in ${termLabel}`
          : `${attempt.courseCode} moved to ${termLabel}`
        : result.message,
      result.ok ? "success" : "warning",
    );
  };

  const requestDrop = (drop: PendingDrop) => {
    const attempt = state.attempts.find((item) => item.id === drop.attemptId);
    const course = attempt
      ? planningCourseForAttempt(attempt, planningCatalogue)
      : undefined;
    if (!attempt || !course || drop.attemptId === drop.beforeAttemptId) return;

    if (attempt.termId === drop.termId) return;

    if (
      attempt.status === "completed" ||
      attempt.status === "failed" ||
      attempt.status === "withdrawn"
    ) {
      notify(
        `${attempt.courseCode} already has a result. Courses with a result stay in their semester.`,
        "warning",
      );
      return;
    }

    const destinationTerm = timelineTerms.find(
      (term) => term.id === drop.termId,
    );
    if (
      destinationTerm &&
      destinationTerm.id !== "unscheduled" &&
      course.year !== destinationTerm.year
    ) {
      notify(
        `${attempt.courseCode} is a ${course.year} course. Remove it and add the ${destinationTerm.year} version instead.`,
        "warning",
      );
      return;
    }

    const destination = entriesFor(drop.termId).filter(
      (entry) => entry.attempt.id !== drop.attemptId,
    );
    const nextUnits = unitsOf(destination) + unitsForAttempt(attempt, course);
    if (
      drop.termId !== "unscheduled" &&
      (destination.length + 1 > STANDARD_COURSE_SLOTS || nextUnits > 24)
    ) {
      setPendingDrop(drop);
      setOverloadTerm(drop.termId);
      return;
    }

    applyDrop(drop);
  };

  const requestAddCourse = (
    term: Term,
    intent: "all" | "recommended" = "all",
  ) => {
    const entries = entriesFor(term.id);
    if (
      term.id !== "unscheduled" &&
      (entries.length >= STANDARD_COURSE_SLOTS || unitsOf(entries) >= 24)
    ) {
      setPendingDrop(null);
      setOverloadTerm(term.id);
      return;
    }
    setPicker({ termId: term.id, intent });
  };

  const previewDrop = (drop: PendingDrop) => {
    dragPreviewRef.current = drop;
    setDragPreview((current) =>
      current?.attemptId === drop.attemptId &&
      current.termId === drop.termId &&
      current.beforeAttemptId === drop.beforeAttemptId
        ? current
        : drop,
    );
  };

  const finishPointerDrag = (cancelled = false) => {
    const drop = dragPreviewRef.current;
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    dragPreviewRef.current = null;
    setDragPointer(null);
    setDragging(null);
    setDragPreview(null);
    const suggestion = draggedSuggestionRef.current;
    draggedSuggestionRef.current = null;
    setDraggedSuggestion(null);
    if (cancelled || !drop) return;
    if (suggestion && drop.attemptId.startsWith(SUGGESTION_DRAG)) {
      const term = timelineTerms.find((item) => item.id === drop.termId);
      if (term) void requestAddSuggested(suggestion.course, term);
      return;
    }
    requestDrop(drop);
  };

  const startPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragId: string,
    /** Where the dragged course sits now; none for a suggestion. */
    termId: string | null,
  ) => {
    if (event.button !== 0 || pointerCleanupRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const row = event.currentTarget.closest<HTMLElement>("[data-drag-row]");
    if (!row) return;
    const rect = row.getBoundingClientRect();

    setDragging(dragId);
    if (termId) previewDrop({ attemptId: dragId, termId });
    setDragPointer({
      initialX: event.clientX,
      initialY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      rowHeight: rect.height,
    });

    const cleanup = () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      hoverTabRef.current = undefined;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      if (floatingCardRef.current) {
        floatingCardRef.current.style.transform = `translate3d(${moveEvent.clientX - (event.clientX - rect.left)}px, ${moveEvent.clientY - (event.clientY - rect.top)}px, 0)`;
      }

      const board = boardRef.current;
      const contained = board && getComputedStyle(board).overflowY === "auto";
      const bounds = contained ? board.getBoundingClientRect() : null;
      const scrollTarget = contained ? board : window;
      if (moveEvent.clientY < (bounds?.top ?? 0) + 72) {
        scrollTarget.scrollBy({ top: -12, behavior: "auto" });
      }
      if (moveEvent.clientY > (bounds?.bottom ?? window.innerHeight) - 72) {
        scrollTarget.scrollBy({ top: 12, behavior: "auto" });
      }

      const target = document.elementFromPoint(
        moveEvent.clientX,
        moveEvent.clientY,
      );
      // Holding a course over a year tab opens that year to drop it in.
      const tab =
        target?.closest<HTMLElement>("[data-year-tab]")?.dataset.yearTab;
      if (tab !== hoverTabRef.current) {
        hoverTabRef.current = tab;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = tab
          ? setTimeout(() => setSelectedYearKey(tab), 450)
          : null;
      }

      const lane = target?.closest<HTMLElement>("[data-drop-term]");
      const termId = lane?.dataset.dropTerm;
      if (!lane || !termId) return;

      previewDrop({ attemptId: dragId, termId });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === event.pointerId) finishPointerDrag();
    };
    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === event.pointerId) finishPointerDrag(true);
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") finishPointerDrag(true);
    };

    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
  };

  const startSuggestionDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    suggestion: CourseToPlan,
  ) => {
    if (event.button !== 0 || pointerCleanupRef.current) return;
    draggedSuggestionRef.current = suggestion;
    setDraggedSuggestion(suggestion);
    startPointerDrag(
      event,
      `${SUGGESTION_DRAG}${suggestion.course.code}`,
      null,
    );
  };

  const renderLane = (term: Term) => {
    const entries = entriesFor(term.id);
    const units = unitsOf(entries);
    const previewEntry = draggedEntry;
    const previewApplies = Boolean(
      previewEntry && dragPreview?.termId === term.id,
    );
    const containsDragged = Boolean(
      dragging && entries.some((entry) => entry.attempt.id === dragging),
    );
    const previewUsesEmptySlot = Boolean(
      previewApplies &&
      !containsDragged &&
      (term.id === "unscheduled" || entries.length < STANDARD_COURSE_SLOTS),
    );
    const emptySlots =
      term.id === "unscheduled"
        ? entries.length === 0 && !previewUsesEmptySlot
          ? 1
          : 0
        : Math.max(
            0,
            STANDARD_COURSE_SLOTS -
              entries.length -
              Number(previewUsesEmptySlot),
          );
    const remainingEmpty = emptySlots;

    const dropPreview = previewEntry ? (
      <div
        key={`drop-preview-${previewEntry.attempt.id}-${term.id}`}
        aria-hidden="true"
        className="pointer-events-none flex min-h-[52px] origin-top animate-drop-slot-in items-center gap-2.5 rounded-lg bg-primary/10 px-2 py-2 text-left ring-1 ring-primary/30 ring-inset"
      >
        <GripVertical size={13} className="shrink-0 text-primary/50" />
        <StatusMark status={previewEntry.status} />
        <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-primary">
          {previewEntry.course.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {previewEntry.course.name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {unitsForAttempt(previewEntry.attempt, previewEntry.course)}u
        </span>
      </div>
    ) : null;

    return (
      <div
        key={term.id}
        data-testid={`term-${term.id}`}
        data-drop-term={term.id}
        className={cn(
          "flex min-h-44 flex-col rounded-xl bg-card p-2.5 ring-1 transition",
          dragging && dragPreview?.termId === term.id
            ? "ring-2 ring-primary/40"
            : "ring-border",
        )}
      >
        <header className="flex items-center justify-between gap-2 px-1 pb-2">
          <p className="text-[13px] font-semibold text-foreground">
            {term.name}
            <span className="ml-2 font-normal text-muted-foreground">
              {term.dates}
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-[11px] font-medium",
                units > 24
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            >
              {term.id === "unscheduled"
                ? `${units} units`
                : `${units} / 24 units`}
              {units > 24 && " · Overload"}
            </span>
            <button
              type="button"
              onClick={() => requestAddCourse(term)}
              aria-label={`Add a course to ${term.name} ${term.year}`}
              className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Plus size={14} />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-1">
          {entries.map((entry) => {
            const note = issueNote(entry);
            if (dragging === entry.attempt.id) {
              return (
                <div
                  key={entry.attempt.id}
                  aria-hidden="true"
                  className="flex min-h-[52px] items-center justify-center gap-2 rounded-lg border border-dashed border-border px-2 text-[11px] font-medium text-muted-foreground"
                  style={{ height: dragPointer?.rowHeight }}
                >
                  <span className="grid size-[15px] shrink-0 place-items-center rounded-full border border-border bg-card">
                    <Plus size={10} />
                  </span>
                  <span>Add course</span>
                </div>
              );
            }
            return (
              <div
                key={entry.attempt.id}
                data-attempt-id={entry.attempt.id}
                data-drag-row
                className="group relative grid min-h-[52px] grid-cols-[1.75rem_minmax(0,1fr)] rounded-lg transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  aria-label={`Reorder ${entry.course.code}`}
                  onPointerDown={(event) =>
                    startPointerDrag(event, entry.attempt.id, term.id)
                  }
                  className="grid cursor-grab touch-none place-items-center rounded-l-lg text-muted-foreground/40 transition hover:text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical size={13} aria-hidden="true" />
                </button>
                <Tooltip open={note ? undefined : false}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setSelectedAttempt(entry.attempt.id)}
                      className="min-w-0 cursor-pointer py-2 pr-2 text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <StatusMark status={entry.status} />
                        <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                          {entry.course.code}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                          {entry.course.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {unitsForAttempt(entry.attempt, entry.course)}u
                        </span>
                      </span>
                    </button>
                  </TooltipTrigger>
                  {note ? (
                    <TooltipContent align="start" side="bottom">
                      {note}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
                {entry.status === "blocked" && (
                  <div className="col-span-2 flex justify-end px-2 pb-2">
                    <FixIssueButton
                      attempt={entry.attempt}
                      catalogue={planningCatalogue}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {previewUsesEmptySlot && dropPreview}
          {Array.from({ length: remainingEmpty }, (_, index) => (
            <button
              key={`${term.id}-empty-${index}`}
              type="button"
              onClick={() => requestAddCourse(term)}
              aria-label={
                term.id === "unscheduled"
                  ? "Add an unscheduled course"
                  : `Add course in empty slot ${entries.length + index + 1} of ${STANDARD_COURSE_SLOTS} for ${term.name} ${term.year}`
              }
              className="group flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-2 text-[11px] font-medium text-muted-foreground transition hover:border-muted-foreground/40 hover:bg-muted/50 hover:text-foreground"
            >
              <span className="grid size-[15px] shrink-0 place-items-center rounded-full border border-border bg-card transition group-hover:border-muted-foreground/40">
                <Plus size={10} />
              </span>
              <span>Add course</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const overloadTarget = overloadTerm
    ? timelineTerms.find((term) => term.id === overloadTerm)
    : undefined;
  const draggedAttempt = dragging
    ? state.attempts.find((attempt) => attempt.id === dragging)
    : undefined;
  const draggedCourse = draggedAttempt
    ? planningCourseForAttempt(draggedAttempt, planningCatalogue)
    : undefined;
  const draggedStatus = draggedAttempt
    ? effectiveStatus(draggedAttempt, state.attempts, planningCatalogue)
    : undefined;
  const draggedEntry: Entry | undefined =
    draggedSuggestion && dragging?.startsWith(SUGGESTION_DRAG)
      ? {
          attempt: {
            id: dragging,
            courseCode: draggedSuggestion.course.code,
            termId: "",
            status: "planned",
          },
          course: draggedSuggestion.course,
          status: "planned",
        }
      : draggedAttempt && draggedCourse && draggedStatus
        ? {
            attempt: draggedAttempt,
            course: draggedCourse,
            status: draggedStatus,
          }
        : undefined;

  if (!degree) {
    return (
      <AppShell fill fullWidth>
        <div className="workspace-scroll flex flex-col gap-5">
          <OnboardingPrompt className="min-h-0 flex-none" />
          <div aria-hidden="true" className="flex flex-col gap-5 opacity-40">
            {[1, 2, 3].map((studyYear) => (
              <section key={studyYear}>
                <h2 className="mb-2 px-1 text-sm font-semibold text-foreground">
                  Year {studyYear}
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {["First Semester", "Second Semester"].map((name) => (
                    <div
                      key={name}
                      className="flex min-h-44 items-start justify-between rounded-xl bg-card p-3.5 ring-1 ring-border"
                    >
                      <p className="text-[13px] font-semibold text-foreground">
                        {name}
                      </p>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        0 / 24 units
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fill fullWidth>
      <h1 className="sr-only">Planner</h1>
      <div className="workspace-scroll flex flex-col gap-4" ref={boardRef}>
        <YearTabs
          years={yearTabs}
          selectedKey={selectedYear?.key ?? ""}
          onSelect={setSelectedYearKey}
        />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <section
            aria-label="Course plan"
            data-testid="roadmap-board"
            className="flex min-w-0 flex-1 flex-col gap-3"
          >
            {selectedTerms.map(renderLane)}
          </section>
          {panelOpen ? (
            <aside
              aria-label="Courses to plan"
              className="min-w-0 lg:sticky lg:top-0 lg:w-[26rem] lg:shrink-0"
            >
              <CoursesToPlan
                required={toPlan.required}
                suggested={toPlan.suggested}
                starred={starred}
                structures={structures}
                rulesLeft={rulesToPlanCount(structures)}
                onAdd={addToSelectedYear}
                onDragStart={startSuggestionDrag}
                onHide={() => setPanelOpen(false)}
              />
            </aside>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="self-end lg:self-start"
              onClick={() => setPanelOpen(true)}
            >
              Courses to plan
              <span className="text-muted-foreground tabular-nums">
                {toPlan.required.length + toPlan.suggested.length}
              </span>
            </Button>
          )}
        </div>
      </div>

      {dragPointer && draggedEntry && (
        <div className="pointer-events-none fixed inset-0 z-[120] cursor-grabbing select-none">
          <div
            ref={floatingCardRef}
            aria-hidden="true"
            className="absolute top-0 left-0 flex min-h-[52px] items-center gap-2.5 rounded-lg bg-card px-2 py-2 text-left opacity-95 shadow-lg ring-1 ring-border will-change-transform"
            style={{
              width: dragPointer.width,
              transform: `translate3d(${dragPointer.initialX - dragPointer.offsetX}px, ${dragPointer.initialY - dragPointer.offsetY}px, 0)`,
            }}
          >
            <GripVertical
              size={13}
              className="shrink-0 text-muted-foreground"
            />
            <StatusMark status={draggedEntry.status} />
            <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-muted-foreground">
              {draggedEntry.course.code}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {draggedEntry.course.name}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {unitsForAttempt(draggedEntry.attempt, draggedEntry.course)}u
            </span>
          </div>
        </div>
      )}

      {picker && pickerTerm && (
        <CoursePicker
          term={pickerTerm}
          intent={picker.intent}
          academicYears={degreeYears.map((item) => item.year)}
          recommendedCodes={recommendedCodes}
          onClose={() => setPicker(null)}
        />
      )}
      {overloadTarget && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open)
              (() => {
                setOverloadTerm(null);
                setPendingDrop(null);
              })();
          }}
        >
          <DialogContent
            {...overloadFocus}
            showCloseButton={false}
            aria-labelledby={"overload-warning-title"}
            aria-describedby={undefined}
            className={"max-w-md"}
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30 ring-inset dark:text-amber-400">
                  <AlertTriangle size={19} />
                </span>
                <DialogTitle asChild>
                  <h2
                    id="overload-warning-title"
                    className="text-lg font-bold tracking-tight text-foreground"
                  >
                    This semester is already full
                  </h2>
                </DialogTitle>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {pendingDrop
                  ? `Moving this course to ${overloadTarget.name} ${overloadTarget.year} would exceed the standard four-course, 24-unit study load.`
                  : `Adding another course would take ${overloadTarget.name} ${overloadTarget.year} above the standard four-course, 24-unit study load.`}{" "}
                Overloading may require approval.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
              <Button variant="outline" onClick={() => setOverloadTerm(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (pendingDrop) {
                    applyDrop(pendingDrop);
                  } else {
                    setPicker({ termId: overloadTarget.id, intent: "all" });
                  }
                  setOverloadTerm(null);
                  setPendingDrop(null);
                }}
              >
                {pendingDrop ? "Move anyway" : "Continue to courses"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {selectedAttempt && (
        <CourseDialog
          attemptId={selectedAttempt}
          catalogue={planningCatalogue}
          onClose={() => setSelectedAttempt(null)}
        />
      )}
    </AppShell>
  );
}
