"use client";

import { useReturnFocus } from "@/hooks/use-return-focus";
import {
  AlertTriangle,
  ArrowRight,
  GripVertical,
  Plus,
  ShieldCheck,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { creditedRequirementUnits } from "@/lib/coursemap/requirement-progress";
import { cn } from "@/lib/cn";
import { useCoursemap } from "@/app/providers";
import { AppShell } from "@/ui/shell";
import { OnboardingPrompt } from "@/ui/common/onboarding-prompt";
import { PlannerSkeleton } from "@/ui/plan/planner-skeleton";
import { CourseDialog, CoursePicker } from "@/ui/overlays";
import { Button } from "@coursemap/ui/primitives/button";
import { PlanRowMenu } from "@/ui/plan/plan-row-menu";
import { usePlanFix } from "@/ui/plan/use-plan-fix";
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
import { StatusMark } from "@/ui/plan/status-mark";
import { CoursesToPlan } from "@/ui/plan/courses-to-plan";
import { CoursesToPlanSkeleton } from "@/ui/plan/courses-to-plan-skeleton";
import {
  courseForTerm,
  structuresToPlan,
  type CourseToPlan,
  type PlannedStructure,
} from "@/ui/plan/plan-suggestions";
import {
  attemptStatusByCode,
  planTreeContext,
} from "@/ui/requirements/plan-tree-context";
import { ResolvePanel } from "@/ui/plan/resolve-panel";
import { OVERRIDE_REASONS } from "@/lib/coursemap/plan-overrides";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { recommendedCourseCodes } from "@/lib/coursemap/requirement-display";
import { planStructureCodes } from "@/lib/coursemap/plan-structure-codes";
import {
  isSemesterTerm,
  sessionShortName,
} from "@/lib/coursemap/academic-periods";
import {
  MAX_PLAN_EXTENSION_YEARS,
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import {
  STANDARD_COURSE_SLOTS,
  STANDARD_TERM_UNITS,
  OVERLOAD_PERMISSION_UNITS,
  courseIsAvailable,
  displayCourseForAttempt,
  effectiveStatus,
  coursePlanStatus,
  type CoursePlanStatus,
  type PlanFixStep,
  planningCourseForAttempt,
  unitsForAttempt,
  type EffectiveStatus,
} from "@/lib/planner";

export type Entry = {
  attempt: Attempt;
  course: Course;
  status: EffectiveStatus;
  flags?: CoursePlanStatus;
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
/** Where a planned course dropped on the courses to plan box goes: out of the plan. */
const REMOVE_DROP = "remove";
/** Short sessions a student opened on the board, kept between visits. */
const OPEN_SESSIONS_KEY = "coursemap.plan.open-sessions";

function readOpenSessions(): string[] {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(OPEN_SESSIONS_KEY) ?? "[]",
    );
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveOpenSessions(termIds: readonly string[]) {
  try {
    window.localStorage.setItem(OPEN_SESSIONS_KEY, JSON.stringify(termIds));
  } catch {
    // Without storage an opened session lasts until the page is left.
  }
}

/**
 * Leaves out "couldn't check" warnings on a course the catalogue has not
 * caught up with yet; real blocks still show at once.
 */
function settledFlags(
  flags: CoursePlanStatus,
  isSettled: boolean,
): CoursePlanStatus {
  return isSettled
    ? flags
    : {
        ...flags,
        issues: flags.issues.filter((issue) => issue.code !== "unverified"),
      };
}

export function PlanBoard({
  catalogue,
  suggestionsLoading = false,
}: {
  catalogue: PlanCatalogue;
  suggestionsLoading?: boolean;
}) {
  const overloadFocus = useReturnFocus();
  const {
    state,
    reorderAttempt,
    addCourse,
    removeAttempt,
    bypassCourse,
    setPlacement,
    setPlanExtensionYears,
    notify,
  } = useCoursemap();
  const [selectedYearKey, setSelectedYearKey] = useState<string | null>(null);
  const [openSessions, setOpenSessions] = useState<string[]>([]);
  useEffect(() => {
    // Storage is read after hydration so the server and client agree.
    window.queueMicrotask(() => setOpenSessions(readOpenSessions()));
  }, []);
  const toggleSession = (termId: string, open: boolean) => {
    setOpenSessions((current) => {
      const next = open
        ? [...new Set([...current, termId])]
        : current.filter((item) => item !== termId);
      saveOpenSessions(next);
      return next;
    });
  };
  const [fetchedCourses, setFetchedCourses] = useState<Course[]>([]);
  // Attempts the server's catalogue has already seen. A course added since
  // the last catalogue can't have its requirements checked until the
  // refresh lands, so it reads as planned rather than flashing a warning.
  // The one blocked course whose Resolve panel is open. Its fix is
  // previewed on the lanes until it is applied or put away.
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [settled, setSettled] = useState(() => ({
    catalogue,
    ids: new Set(state.attempts.map((attempt) => attempt.id)),
  }));
  if (settled.catalogue !== catalogue) {
    setSettled({
      catalogue,
      ids: new Set(state.attempts.map((attempt) => attempt.id)),
    });
  }
  const [draggedSuggestion, setDraggedSuggestion] =
    useState<CourseToPlan | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [overloadTerm, setOverloadTerm] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  // A course from the panel waiting on the overload confirmation.
  const [pendingCourse, setPendingCourse] = useState<Course | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null);
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
  const planningCatalogue = useMemo(() => {
    const known = [
      ...catalogue.courses,
      ...fetchedCourses.filter(
        (course) =>
          !catalogue.courses.some((item) => item.code === course.code),
      ),
    ];
    const base = {
      ...catalogue,
      courseOverrides: state.courseOverrides,
      creditedRequirementUnits: creditedRequirementUnits(
        catalogue.structureRequirements,
        state.requirementOverrides ?? [],
        new Set([
          state.profile.degreeCode,
          state.profile.majorCode,
          ...(state.profile.minorCodes ?? []),
          ...(state.profile.specialisationCodes ?? []),
        ]),
      ),
      courses: known,
      terms: timelineTerms,
      commencementYear: state.profile.commencementYear,
      enrolmentMode: state.profile.enrolmentMode,
      programmeCodes: state.profile.degreeCode
        ? [state.profile.degreeCode]
        : [],
      structureCodes: planStructureCodes({
        majorCode: state.profile.majorCode,
        minorCodes: state.profile.minorCodes,
        specialisationCodes: state.profile.specialisationCodes,
      }),
    };
    return base;
  }, [
    catalogue,
    fetchedCourses,
    timelineTerms,
    state.courseOverrides,
    state.requirementOverrides,
    state.profile.majorCode,
    state.profile.minorCodes,
    state.profile.specialisationCodes,
    state.profile.commencementYear,
    state.profile.enrolmentMode,
    state.profile.degreeCode,
  ]);
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

  const resolvingAttempt =
    state.attempts.find((attempt) => attempt.id === resolvingId) ?? null;
  const resolving = usePlanFix(resolvingAttempt, planningCatalogue);
  const fixPreview: readonly PlanFixStep[] | null = resolving.proposal.ok
    ? resolving.proposal.steps
    : null;

  const entriesFor = (termId: string): Entry[] =>
    state.attempts
      .filter(
        (attempt) =>
          attempt.termId === termId && attempt.status !== "withdrawn",
      )
      .map((attempt): Entry | null => {
        const course = displayCourseForAttempt(attempt, planningCatalogue);
        return course
          ? {
              attempt,
              course,
              flags: settledFlags(
                coursePlanStatus(attempt, state.attempts, planningCatalogue),
                settled.ids.has(attempt.id),
              ),
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
    entriesFor(term.id).length < STANDARD_COURSE_SLOTS;
  const termsFor = (key: string) =>
    timelineTerms.filter((term) => String(term.year) === key);
  const yearTabs: YearTab[] = [
    ...[...new Set(timelineTerms.map((term) => term.year))].map((year) => {
      const terms = termsFor(String(year));
      const entries = terms.flatMap((term) => entriesFor(term.id));
      return {
        key: String(year),
        label: `Year ${Math.max(1, year - state.profile.commencementYear + 1)}`,
        detail: String(year),
        units: unitsOf(entries),
        // Short sessions are optional extra load, so the year's target is
        // the two semesters alone.
        target: terms.filter(isSemesterTerm).length * STANDARD_TERM_UNITS,
        finished:
          entries.length > 0 &&
          entries.every((entry) => entry.attempt.status === "completed"),
      };
    }),
  ];
  // Opens on the first year with room that is not already behind the
  // student, so the page starts where there is planning to do.
  const selectedYear =
    yearTabs.find((year) => year.key === selectedYearKey) ??
    yearTabs.find(
      (year) =>
        !year.finished &&
        termsFor(year.key).filter(isSemesterTerm).some(hasRoom),
    ) ??
    yearTabs.find((year) => !year.finished) ??
    yearTabs[0];
  const selectedTerms = selectedYear ? termsFor(selectedYear.key) : [];
  const semesterTerms = selectedTerms.filter(isSemesterTerm);
  const shortTerms = selectedTerms.filter((term) => !isSemesterTerm(term));
  // A short session shows once it holds a course or the student opens it,
  // so a year starts as its two semesters.
  const shownTerms = selectedTerms.filter(
    (term) =>
      isSemesterTerm(term) ||
      openSessions.includes(term.id) ||
      entriesFor(term.id).length > 0,
  );
  const hiddenSessions = shortTerms.filter(
    (term) => !shownTerms.includes(term),
  );
  // Years past the programme's length were added by the student, and the
  // last one can be taken away again while it is empty.
  const lastYear = yearTabs.at(-1);
  const canRemoveYear =
    state.profile.extensionYears > 0 &&
    selectedYear !== undefined &&
    selectedYear.key === lastYear?.key &&
    selectedTerms.every((term) => entriesFor(term.id).length === 0);
  const changeYears = async (extensionYears: number, select?: string) => {
    const result = await setPlanExtensionYears(extensionYears);
    notify(result.message, result.ok ? "success" : "warning");
    if (result.ok && select) setSelectedYearKey(select);
  };

  const requestAddSuggested = async (picked: Course, term: Term) => {
    const course =
      courseForTerm(picked.code, term, planningCatalogue) ?? picked;
    if (course.sessions.length > 0 && !courseIsAvailable(course, term.name)) {
      notify(
        `${course.code} is not offered in ${term.name}. It runs in ${course.sessions.join(" and ")}.`,
        "warning",
      );
      return;
    }
    const entries = entriesFor(term.id);
    if (
      entries.length >= STANDARD_COURSE_SLOTS ||
      unitsOf(entries) + course.units > 24
    ) {
      setPendingDrop(null);
      setPendingCourse(course);
      setOverloadTerm(term.id);
      return;
    }
    const result = await addCourse(course.code, term.id, course.year);
    notify(
      result.ok
        ? `${course.code} added to ${term.name} ${term.year}`
        : result.message,
      result.ok ? "success" : "warning",
    );
  };

  const offeredIn = (picked: Course, term: Term) => {
    const course =
      courseForTerm(picked.code, term, planningCatalogue) ?? picked;
    return course.sessions.length === 0 || courseIsAvailable(course, term.name);
  };
  const addToSelectedYear = (course: Course) => {
    // Semesters come first so a course that also runs in Summer lands in S1.
    const candidates = [...semesterTerms, ...shortTerms];
    const term =
      candidates.find((item) => hasRoom(item) && offeredIn(course, item)) ??
      candidates.find((item) => offeredIn(course, item));
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
            overrides: state.requirementOverrides ?? [],
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
  const toPlan = structuresToPlan({
    structures,
    catalogue: planningCatalogue,
  });

  // Starred and planned courses the planner has not loaded, such as one
  // just added from search, are fetched by code.
  const findCourse = (code: string) =>
    planningCatalogue.courses.find(
      (course) =>
        course.code === code && course.year === catalogue.academicYear,
    ) ??
    planningCatalogue.courses.find((course) => course.code === code) ??
    fetchedCourses.find((course) => course.code === code);
  const starredCodes = state.starredCourses ?? [];
  const missingStarred = [
    ...new Set([
      ...starredCodes,
      ...state.attempts
        .filter((attempt) => attempt.status !== "withdrawn")
        .map((attempt) => attempt.courseCode),
    ]),
  ]
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

  /** A course in the plan opens as itself; any other opens to be added. */
  const openCourse = (course: Course) => {
    const attempt = state.attempts.find(
      (item) => item.courseCode === course.code && item.status !== "withdrawn",
    );
    if (attempt) setSelectedAttempt(attempt.id);
    else setPreviewCourse(course);
  };

  const issueNote = (entry: Entry) =>
    entry.flags?.issues.map((issue) => issue.detail).join("; ") || null;

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

    const destination = entriesFor(drop.termId).filter(
      (entry) => entry.attempt.id !== drop.attemptId,
    );
    const nextUnits = unitsOf(destination) + unitsForAttempt(attempt, course);
    if (destination.length + 1 > STANDARD_COURSE_SLOTS || nextUnits > 24) {
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
    if (entries.length >= STANDARD_COURSE_SLOTS || unitsOf(entries) >= 24) {
      setPendingDrop(null);
      setPendingCourse(null);
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
    if (drop.termId === REMOVE_DROP) {
      void removeAttempt(drop.attemptId).then((result) =>
        notify(result.message, result.ok ? "success" : "error"),
      );
      return;
    }
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
    const status = state.attempts.find((item) => item.id === dragId)?.status;
    // Recorded attempts stay in the academic history, so only planned ones
    // can be dragged back out of the plan.
    const removable =
      status !== "completed" && status !== "failed" && status !== "withdrawn";

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

      // A course lands only where it is let go: off every lane, a planned
      // course falls back to where it was and a suggestion to nowhere.
      const lane = target?.closest<HTMLElement>("[data-drop-term]");
      const over = lane?.dataset.dropTerm;
      if (over) {
        previewDrop({ attemptId: dragId, termId: over });
      } else if (termId && removable && target?.closest("[data-drop-remove]")) {
        previewDrop({ attemptId: dragId, termId: REMOVE_DROP });
      } else if (termId) {
        previewDrop({ attemptId: dragId, termId });
      } else {
        dragPreviewRef.current = null;
        setDragPreview(null);
      }
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

  const overloadTarget = overloadTerm
    ? timelineTerms.find((term) => term.id === overloadTerm)
    : undefined;
  // The semester's units once the waiting course lands, when it is known.
  const overloadUnits = (() => {
    if (!overloadTarget) return null;
    const entries = entriesFor(overloadTarget.id);
    if (pendingCourse) return unitsOf(entries) + pendingCourse.units;
    const moving = pendingDrop
      ? state.attempts.find((item) => item.id === pendingDrop.attemptId)
      : undefined;
    const movingCourse = moving
      ? planningCourseForAttempt(moving, planningCatalogue)
      : undefined;
    return moving && movingCourse
      ? unitsOf(entries.filter((entry) => entry.attempt.id !== moving.id)) +
          unitsForAttempt(moving, movingCourse)
      : null;
  })();
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
            flags: coursePlanStatus(
              draggedAttempt,
              state.attempts,
              planningCatalogue,
            ),
          }
        : undefined;

  const renderDropPreview = (key: string) =>
    draggedEntry ? (
      <div
        key={`drop-preview-${draggedEntry.attempt.id}-${key}`}
        aria-hidden="true"
        className="pointer-events-none flex min-h-[52px] origin-top animate-drop-slot-in items-center gap-2.5 rounded-lg bg-primary/10 px-2 py-2 text-left ring-1 ring-primary/30 ring-inset"
      >
        <GripVertical size={13} className="shrink-0 text-primary/50" />
        <StatusMark status={draggedEntry.status} flags={draggedEntry.flags} />
        <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-primary">
          {draggedEntry.course.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {draggedEntry.course.name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {unitsForAttempt(draggedEntry.attempt, draggedEntry.course)}u
        </span>
      </div>
    ) : null;

  /** One planned course; short sessions tag each row with its session. */
  const renderEntry = (entry: Entry, term: Term, session?: string) => {
    const note = issueNote(entry);
    const isResolving = resolvingId === entry.attempt.id;
    const bypassOverride =
      entry.attempt.status === "planned"
        ? state.courseOverrides?.find(
            (item) => item.courseCode === entry.course.code,
          )
        : undefined;
    // Anything that stops or holds up the course can be resolved: by the
    // fix Coursemap finds, or by taking it anyway with a reason.
    const canBypass =
      !bypassOverride &&
      entry.attempt.status === "planned" &&
      ["blocked", "approval", "review"].includes(entry.status);
    const canResolve = canBypass;
    const moveStep = fixPreview?.find(
      (step) =>
        step.type === "move" &&
        step.attemptId === entry.attempt.id &&
        step.toTermId !== term.id,
    );
    const moveTerm =
      moveStep?.type === "move"
        ? timelineTerms.find((item) => item.id === moveStep.toTermId)
        : undefined;
    const movingTo = moveTerm
      ? `${sessionShortName(moveTerm.name)} ${moveTerm.year}`
      : null;
    const usesStandIn =
      entry.attempt.status === "planned" &&
      entry.attempt.isPublished !== false &&
      entry.course.year !== term.year;
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
        className={cn(
          "group relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] grid-rows-[minmax(52px,auto)] items-center rounded-lg transition",
          isResolving
            ? "bg-muted/60 ring-1 ring-primary/40"
            : "hover:bg-muted/50",
        )}
      >
        <button
          type="button"
          aria-label={`Reorder ${entry.course.code}`}
          onPointerDown={(event) =>
            startPointerDrag(event, entry.attempt.id, term.id)
          }
          className="grid cursor-grab touch-none place-items-center self-stretch rounded-l-lg text-muted-foreground/40 transition hover:text-muted-foreground active:cursor-grabbing"
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
                {bypassOverride ? (
                  <ShieldCheck
                    size={15}
                    aria-label={`Taken anyway: ${OVERRIDE_REASONS[bypassOverride.reason]}`}
                    className="shrink-0 text-muted-foreground"
                  />
                ) : (
                  <StatusMark status={entry.status} flags={entry.flags} />
                )}
                <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                  {entry.course.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                  {entry.course.name}
                </span>
                {session ? (
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {session}
                  </span>
                ) : null}
              </span>
            </button>
          </TooltipTrigger>
          {note ? (
            <TooltipContent align="start" side="bottom">
              <ul className="space-y-1">
                {entry.flags?.issues.map((issue) => (
                  <li key={`${issue.code}:${issue.detail}`}>{issue.detail}</li>
                ))}
              </ul>
            </TooltipContent>
          ) : null}
        </Tooltip>
        <div className="flex items-center gap-2 pr-2">
          {movingTo ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary duration-200 animate-in fade-in-0">
              <ArrowRight size={11} aria-hidden="true" />
              {movingTo}
            </span>
          ) : null}
          {canResolve ? (
            <button
              type="button"
              aria-expanded={isResolving}
              title={note ?? undefined}
              onClick={() =>
                setResolvingId(isResolving ? null : entry.attempt.id)
              }
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/10",
                isResolving && "bg-primary/10",
              )}
            >
              <WandSparkles size={12} aria-hidden="true" />
              Resolve
            </button>
          ) : null}
          <PlanRowMenu
            course={entry.course}
            moveTargets={timelineTerms.filter(
              (item) => item.id !== term.id && offeredIn(entry.course, item),
            )}
            coursePageHref={
              usesStandIn
                ? null
                : `/courses/${entry.course.year}/${entry.course.code.toLowerCase()}`
            }
            onOpen={() => setSelectedAttempt(entry.attempt.id)}
            onMove={(termId) =>
              void reorderAttempt(entry.attempt.id, termId).then((result) =>
                notify(result.message, result.ok ? "success" : "warning"),
              )
            }
            onUndoBypass={
              bypassOverride
                ? () =>
                    void bypassCourse(entry.course.code, null).then((result) =>
                      notify(result.message, result.ok ? "success" : "error"),
                    )
                : undefined
            }
            onRemove={
              entry.attempt.status === "planned" ||
              entry.attempt.status === "enrolled"
                ? () =>
                    void removeAttempt(entry.attempt.id).then((result) =>
                      notify(result.message, result.ok ? "success" : "error"),
                    )
                : undefined
            }
          />
        </div>
        {/* The panel grows from nothing so the rows below slide rather than jump. */}
        <div
          className={cn(
            "col-span-full grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            isResolving
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {isResolving ? (
              <div className="px-2 pb-2">
                <ResolvePanel
                  courseCode={entry.course.code}
                  proposal={resolving.proposal}
                  catalogue={planningCatalogue}
                  busy={resolving.busy}
                  onApply={() =>
                    void resolving
                      .apply()
                      .then((done) => done && setResolvingId(null))
                  }
                  onClose={() => setResolvingId(null)}
                />
              </div>
            ) : null}
          </div>
        </div>
        {entry.status === "unpublished" && (
          <div className="col-span-3 flex justify-end px-2 pb-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-9"
              aria-label={`Remove ${entry.course.code} from the plan`}
              onClick={() =>
                void removeAttempt(entry.attempt.id).then((result) =>
                  notify(result.message, result.ok ? "success" : "error"),
                )
              }
            >
              Remove
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderLane = (term: Term) => {
    const entries = entriesFor(term.id);
    const units = unitsOf(entries);
    const semester = isSemesterTerm(term);
    // Short sessions keep one empty slot rather than
    // a full semester's four.
    const slotCount = semester ? STANDARD_COURSE_SLOTS : 1;
    const previewApplies = Boolean(
      draggedEntry && dragPreview?.termId === term.id,
    );
    const containsDragged = Boolean(
      dragging && entries.some((entry) => entry.attempt.id === dragging),
    );
    const previewUsesEmptySlot = Boolean(
      previewApplies && !containsDragged && entries.length < slotCount,
    );
    // Courses an open Resolve panel would bring into this term.
    const incoming =
      fixPreview?.filter(
        (step) =>
          (step.type === "add" ? step.termId : step.toTermId) === term.id,
      ) ?? [];
    const emptySlots = Math.max(
      0,
      slotCount -
        entries.length -
        Number(previewUsesEmptySlot) -
        incoming.length,
    );
    const removableSession = !semester && entries.length === 0;
    // While a course is held, a semester it does not run in says so before
    // the drop, rather than turning the drop down afterwards.
    const heldCourse = draggedSuggestion?.course ?? draggedCourse;
    const notOffered =
      dragging && heldCourse && !offeredIn(heldCourse, term)
        ? `${heldCourse.code} doesn't run in ${term.name}`
        : null;

    return (
      <div
        key={term.id}
        data-testid={`term-${term.id}`}
        data-drop-term={term.id}
        className={cn(
          "flex flex-col rounded-xl bg-card p-2.5 ring-1 transition",
          incoming.length > 0
            ? "ring-2 ring-primary/40"
            : notOffered
              ? dragPreview?.termId === term.id
                ? "opacity-60 ring-2 ring-destructive/40"
                : "opacity-60 ring-border"
              : dragging && dragPreview?.termId === term.id
                ? "ring-2 ring-primary/40"
                : "ring-border",
        )}
      >
        {notOffered ? (
          <p className="px-1 pb-1 text-[11px] font-medium text-destructive">
            {notOffered}
          </p>
        ) : null}
        <header className="flex items-center justify-between gap-2 px-1 pb-2">
          <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
            {term.name}
            {term.dates ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {term.dates}
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "text-[11px] font-medium",
                units > 24
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            >
              {semester ? `${units} / 24 units` : `${units} units`}
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
            {removableSession ? (
              <button
                type="button"
                onClick={() => toggleSession(term.id, false)}
                aria-label={`Remove ${term.name} ${term.year}`}
                className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-1">
          {entries.map((entry) => renderEntry(entry, term))}
          {previewUsesEmptySlot && renderDropPreview(term.id)}
          {incoming.map((step) => {
            const course = planningCatalogue.courses.find(
              (item) => item.code === step.courseCode,
            );
            return (
              <div
                key={`fix-${step.courseCode}`}
                aria-label={`${step.courseCode} would be ${step.type === "add" ? "added" : "moved"} here`}
                className="relative grid min-h-[52px] grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center rounded-lg bg-amber-500/5 duration-200 animate-in fade-in-0"
              >
                {/* Only the border pulses, so the course reads steadily. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 animate-pulse rounded-lg border border-amber-500/70"
                />
                <span />
                <span className="flex min-w-0 items-center gap-2.5 py-2 pr-2">
                  {step.type === "add" ? (
                    <Plus
                      size={15}
                      aria-hidden="true"
                      className="shrink-0 text-amber-500"
                    />
                  ) : (
                    <ArrowRight
                      size={15}
                      aria-hidden="true"
                      className="shrink-0 text-amber-500"
                    />
                  )}
                  <span className="w-[4.75rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                    {step.courseCode}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {course?.name ?? step.courseCode}
                  </span>
                </span>
                <span className="pr-2 text-[11px] text-amber-600 dark:text-amber-400">
                  {step.type === "add" ? "Adding" : "Moving here"}
                </span>
              </div>
            );
          })}
          {Array.from({ length: emptySlots }, (_, index) => (
            <button
              key={`${term.id}-empty-${index}`}
              type="button"
              onClick={() => requestAddCourse(term)}
              aria-label={
                semester
                  ? `Add course in empty slot ${entries.length + index + 1} of ${STANDARD_COURSE_SLOTS} for ${term.name} ${term.year}`
                  : `Add a course to ${term.name} ${term.year}`
              }
              className="group flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-2 text-[11px] font-medium text-muted-foreground transition hover:border-muted-foreground/40 hover:bg-muted/50 hover:text-foreground"
            >
              <span className="grid size-[15px] shrink-0 place-items-center rounded-full border border-border bg-card transition group-hover:border-muted-foreground/40">
                <Plus size={10} />
              </span>
              <span>Add course</span>
            </button>
          ))}
          {semester && emptySlots === 0 && !previewUsesEmptySlot ? (
            <button
              type="button"
              onClick={() => requestAddCourse(term)}
              aria-label={`Overload ${term.name} ${term.year} with another course`}
              className="flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2 text-[11px] font-medium text-muted-foreground/80 transition hover:border-amber-500/50 hover:bg-amber-500/5 hover:text-amber-600 dark:hover:text-amber-400"
            >
              <Plus size={12} aria-hidden="true" />
              Overload this semester
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  /**
   * The short sessions this year does not show yet. Choosing one opens its
   * lane straight away; courses go in from there.
   */
  const renderAddSession = () =>
    hiddenSessions.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5">
        <span className="mr-1 text-[12px] text-muted-foreground">
          Add a session
        </span>
        {hiddenSessions.map((term) => (
          <Button
            key={term.id}
            variant="outline"
            size="sm"
            onClick={() => toggleSession(term.id, true)}
            aria-label={`Add ${term.name} ${term.year}`}
            title={term.dates || undefined}
          >
            <Plus aria-hidden="true" />
            {term.shortName}
          </Button>
        ))}
      </div>
    ) : null;

  if (!degree) {
    return (
      <AppShell fill fullWidth>
        <div className="workspace-scroll flex flex-col">
          <OnboardingPrompt backdrop={<PlannerSkeleton />} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fill fullWidth>
      <h1 className="sr-only">Planner</h1>
      <div
        className="workspace-scroll @container flex flex-col gap-4"
        ref={boardRef}
      >
        <YearTabs
          years={yearTabs.map((year) => ({
            ...year,
            previewChanges:
              fixPreview?.filter(
                (step) =>
                  (step.type === "add" ? step.termId : step.toTermId).slice(
                    0,
                    4,
                  ) === year.key && year.key !== selectedYear?.key,
              ).length ?? 0,
          }))}
          selectedKey={selectedYear?.key ?? ""}
          onSelect={setSelectedYearKey}
          onAddYear={
            state.profile.extensionYears < MAX_PLAN_EXTENSION_YEARS
              ? () =>
                  void changeYears(
                    state.profile.extensionYears + 1,
                    String(Number(lastYear?.key ?? 0) + 1),
                  )
              : undefined
          }
        />
        {/* The aside sits beside the board only when the board keeps room for
            its rows, which the window width cannot tell when the assistant
            panel is docked. */}
        <div className="flex flex-col gap-6 @4xl:flex-row @4xl:items-start">
          <section
            aria-label="Course plan"
            data-testid="roadmap-board"
            className="flex min-w-0 flex-1 flex-col gap-3"
          >
            {shownTerms.map(renderLane)}
            {renderAddSession()}
            {canRemoveYear && selectedYear ? (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void changeYears(
                      state.profile.extensionYears - 1,
                      String(Number(selectedYear.key) - 1),
                    )
                  }
                >
                  <X aria-hidden="true" />
                  Remove {selectedYear.label}
                </Button>
              </div>
            ) : null}
          </section>
          <aside
            aria-label="Courses to plan"
            aria-busy={suggestionsLoading}
            data-drop-remove
            className={cn(
              "relative min-w-0 rounded-xl transition @4xl:w-[24rem] @4xl:shrink-0 @4xl:self-stretch",
              dragPreview?.termId === REMOVE_DROP &&
                "ring-2 ring-destructive/40",
            )}
          >
            {suggestionsLoading ? (
              <CoursesToPlanSkeleton className="@4xl:absolute @4xl:inset-0" />
            ) : (
              <CoursesToPlan
                structures={toPlan}
                starred={starred}
                inPlan={statuses}
                onAdd={addToSelectedYear}
                onOpen={openCourse}
                onDragStart={startSuggestionDrag}
              />
            )}
          </aside>
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
            <StatusMark
              status={draggedEntry.status}
              flags={draggedEntry.flags}
            />
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
          recommendedCodes={recommendedCodes}
          catalogue={planningCatalogue}
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
                    Take more than 24 units?
                  </h2>
                </DialogTitle>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {`A full-time load in ${overloadTarget.name} is four courses, 24 units. You can go over it, but it makes for a heavy semester.`}
              </p>
              {overloadUnits !== null &&
              overloadUnits > OVERLOAD_PERMISSION_UNITS ? (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
                  {`That takes it to ${overloadUnits} units. Above ${OVERLOAD_PERMISSION_UNITS}, you'll need permission from your college. Coursemap keeps it in your plan and flags it.`}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
              <Button
                variant="outline"
                onClick={() => {
                  setOverloadTerm(null);
                  setPendingCourse(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (pendingDrop) {
                    applyDrop(pendingDrop);
                  } else if (pendingCourse) {
                    const course = pendingCourse;
                    void addCourse(
                      course.code,
                      overloadTarget.id,
                      course.year,
                    ).then((result) =>
                      notify(
                        result.ok
                          ? `${course.code} added to ${overloadTarget.name} ${overloadTarget.year}`
                          : result.message,
                        result.ok ? "success" : "warning",
                      ),
                    );
                  } else {
                    setPicker({ termId: overloadTarget.id, intent: "all" });
                  }
                  setOverloadTerm(null);
                  setPendingDrop(null);
                  setPendingCourse(null);
                }}
              >
                {pendingDrop
                  ? "Move anyway"
                  : pendingCourse
                    ? `Add ${pendingCourse.code}`
                    : "Choose a course"}
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
      {previewCourse && (
        <CourseDialog
          preview={{
            course: previewCourse,
            addLabel: `Add to ${selectedYear?.label ?? "this year"}`,
            onAdd: () => addToSelectedYear(previewCourse),
          }}
          catalogue={planningCatalogue}
          onClose={() => setPreviewCourse(null)}
        />
      )}
    </AppShell>
  );
}
