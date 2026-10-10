"use client";
import { showToast, type ToastTone } from "@/ui/common/toast";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppGlobalUi } from "@/ui/shell/app-global-ui";
import { useRouter } from "next/navigation";
import type { AuthViewer } from "@/lib/auth/viewer";
import { saveAcademicResult } from "@/lib/academic/actions";
import type {
  AppState,
  Attempt,
  AttemptStatus,
  Profile,
} from "@/lib/coursemap/types";
import { emptyGuestState, guestAttemptId } from "@/lib/coursemap/guest-plan";
import {
  clearGuestPlanCookie,
  writeGuestPlanCookie,
} from "@/lib/coursemap/guest-plan-cookie";

export type { AppState, Profile } from "@/lib/coursemap/types";
import {
  addPlanCourse,
  movePlanCourse,
  recordCourseAttempt,
  removePlanCourse,
  saveProfileAndPlan,
  setCurrentUserPlanExtensionYears,
  setCourseStar,
  setRequirementPlacement,
  type CoursemapActionResult,
} from "@/lib/coursemap/actions";

type AppContextValue = {
  state: AppState;
  ready: boolean;
  canAccessAdmin: boolean;
  /** The plan is kept in this browser's cookies rather than an account. */
  guest: boolean;
  /** Ends guest mode and forgets the plan saved in this browser. */
  leaveGuestMode: () => void;
  /**
   * Records, clears or removes a guest's result in their browser copy, where
   * Academic history would otherwise save it to an account. Null removes it.
   */
  saveGuestResult: (
    attemptId: string,
    change: { status: AttemptStatus; mark?: number } | null,
  ) => CoursemapActionResult;
  updateProfile: (profile: Partial<Profile>) => Promise<CoursemapActionResult>;
  setPlanExtensionYears: (
    extensionYears: number,
  ) => Promise<CoursemapActionResult>;
  addCourse: (
    courseCode: string,
    termId: string,
    academicYear: number,
  ) => Promise<CoursemapActionResult>;
  reorderAttempt: (
    attemptId: string,
    termId: string,
    beforeAttemptId?: string,
  ) => Promise<CoursemapActionResult>;
  updateAttempt: (
    attemptId: string,
    status: AttemptStatus,
    mark?: number,
    attemptedUnits?: number,
  ) => Promise<CoursemapActionResult>;
  removeAttempt: (attemptId: string) => Promise<CoursemapActionResult>;
  /** Moves a course to a part of the degree, or back to automatic with null. */
  setPlacement: (
    courseCode: string,
    placement: { structureCode: string; requirementKey: string } | null,
  ) => Promise<CoursemapActionResult>;
  /** Stars a course to consider later, or unstars it. */
  toggleStar: (courseCode: string) => Promise<CoursemapActionResult>;
  togglePermission: (attemptId: string) => void;
  toggleOverloadApproval: (attemptId: string) => void;
  notify: (message: string, tone?: ToastTone) => void;
};

function createInitialState(viewer: AuthViewer | null, guest: boolean) {
  if (guest) return emptyGuestState();
  return {
    schemaVersion: 1,
    profile: {
      name: "",
      studentId: "",
      email: viewer?.email ?? "",
      commencementYear: new Date().getFullYear(),
      catalogueYear: new Date().getFullYear(),
      degreeCode: "",
      majorCode: "",
      minorCodes: [],
      specialisationCodes: [],
      studyLoad: "Full time",
      extensionYears: 0,
    },
    attempts: [],
  } satisfies AppState;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * A scheduled course takes the version for the year it is placed in, so its
 * academic year follows the term; Later keeps the year it already had.
 */
function courseYearForTerm<T extends number | undefined>(
  termId: string,
  fallback: T,
) {
  const match = /^(\d{4})-/.exec(termId);
  return match ? Number(match[1]) : fallback;
}

/**
 * The plan with one course moved to a term, before another course or at the
 * end of that term's courses.
 */
function moveAttempt(
  attempts: Attempt[],
  attemptId: string,
  termId: string,
  beforeAttemptId?: string,
) {
  const moving = attempts.find((attempt) => attempt.id === attemptId);
  if (!moving || beforeAttemptId === attemptId) return attempts;

  const remaining = attempts.filter((attempt) => attempt.id !== attemptId);
  const next = {
    ...moving,
    termId,
    academicYear: courseYearForTerm(termId, moving.academicYear),
  };
  const beforeIndex = beforeAttemptId
    ? remaining.findIndex((attempt) => attempt.id === beforeAttemptId)
    : -1;

  if (beforeIndex >= 0) {
    remaining.splice(beforeIndex, 0, next);
  } else {
    let insertAt = remaining.length;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (remaining[index].termId === termId) {
        insertAt = index + 1;
        break;
      }
    }
    remaining.splice(insertAt, 0, next);
  }
  return remaining;
}

const GUEST_PLAN_FULL: CoursemapActionResult = {
  ok: false,
  message:
    "This plan is too large to keep in your browser. Create an account to keep adding to it.",
};

export function AppProvider({
  children,
  viewer,
  canAccessAdmin,
  guest = false,
  guestPlanToTransfer = false,
  renderGlobalUi = true,
  initialState: suppliedInitialState,
}: {
  children: React.ReactNode;
  viewer: AuthViewer | null;
  canAccessAdmin: boolean;
  /** A signed-out visitor planning without an account. */
  guest?: boolean;
  /** A signed-in student still has a guest plan in this browser. */
  guestPlanToTransfer?: boolean;
  initialState?: AppState;
  /** Route plan providers reuse the root toast and guest transfer UI. */
  renderGlobalUi?: boolean;
}) {
  const router = useRouter();
  const initialState = useMemo(
    () => suppliedInitialState ?? createInitialState(viewer, guest),
    [suppliedInitialState, viewer, guest],
  );
  const [state, setState] = useState<AppState>(initialState);
  const ready = true;
  // Compare the server plan's contents, not the new object each refresh sends.
  const serverRevision = JSON.stringify([viewer?.id, guest, initialState]);
  const [previousServerRevision, setPreviousServerRevision] =
    useState(serverRevision);
  if (previousServerRevision !== serverRevision) {
    setPreviousServerRevision(serverRevision);
    setState(initialState);
  }
  // Guest changes build on the latest plan, even between renders, so two
  // quick edits never save over one another.
  const latestState = useRef(state);
  useLayoutEffect(() => {
    latestState.current = state;
  }, [state]);

  /** Saves a guest's next plan to the cookie and shows it. */
  const commitGuest = useCallback(
    (
      change: (current: AppState) => AppState,
      message: string,
    ): CoursemapActionResult => {
      const next = change(latestState.current);
      if (!writeGuestPlanCookie(next)) return GUEST_PLAN_FULL;
      latestState.current = next;
      setState(next);
      return { ok: true, message };
    },
    [],
  );

  const saveGuestResult = useCallback(
    (
      attemptId: string,
      change: { status: AttemptStatus; mark?: number } | null,
    ) =>
      commitGuest(
        (current) => ({
          ...current,
          attempts: change
            ? current.attempts.map((item) =>
                item.id === attemptId
                  ? {
                      ...item,
                      status: change.status,
                      mark:
                        change.status === "planned" ? undefined : change.mark,
                      ...(change.status === "planned"
                        ? { unitsAttempted: undefined, unitsEarned: undefined }
                        : {}),
                    }
                  : item,
              )
            : current.attempts.filter((item) => item.id !== attemptId),
        }),
        change === null
          ? "Course removed."
          : change.status === "planned"
            ? "Result cleared."
            : "Result saved.",
      ),
    [commitGuest],
  );

  const leaveGuestMode = useCallback(() => {
    clearGuestPlanCookie();
    router.replace("/");
    router.refresh();
  }, [router]);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    showToast(message, tone);
  }, []);

  const updateProfile = useCallback(
    async (profile: Partial<Profile>) => {
      const nextProfile = { ...state.profile, ...profile };
      if (guest) {
        return commitGuest(
          (current) => ({
            ...current,
            profile: { ...current.profile, ...profile },
          }),
          "Profile saved",
        );
      }

      const result = await saveProfileAndPlan(nextProfile);
      if (!result.ok) return result;
      setState((current) => ({ ...current, profile: nextProfile }));
      return { ok: true, message: "Profile saved" };
    },
    [commitGuest, guest, state.profile],
  );

  const addCourse = useCallback(
    async (courseCode: string, termId: string, academicYear: number) => {
      const occurrenceCount = state.attempts.filter(
        (attempt) => attempt.courseCode === courseCode,
      ).length;
      if (occurrenceCount >= 1) {
        return { ok: false, message: `${courseCode} is already in your plan` };
      }
      if (guest) {
        const result = commitGuest(
          (current) => ({
            ...current,
            attempts: [
              ...current.attempts,
              {
                id: guestAttemptId(),
                academicYear: courseYearForTerm(termId, academicYear),
                courseCode,
                termId,
                status: "planned",
              },
            ],
          }),
          `${courseCode} added to the plan`,
        );
        // The server loads the course versions a plan names from the cookie.
        if (result.ok) router.refresh();
        return result;
      }
      // The course shows at once under a temporary id, which the saved id
      // replaces; a failed save takes it back out.
      const pendingId = `pending-${guestAttemptId()}`;
      setState((current) => ({
        ...current,
        attempts: [
          ...current.attempts,
          {
            id: pendingId,
            academicYear: courseYearForTerm(termId, academicYear),
            courseCode,
            termId,
            status: "planned",
          },
        ],
      }));
      const result = await addPlanCourse(courseCode, termId, academicYear);
      setState((current) => ({
        ...current,
        attempts:
          result.ok && result.id
            ? current.attempts.map((attempt) =>
                attempt.id === pendingId
                  ? { ...attempt, id: result.id! }
                  : attempt,
              )
            : current.attempts.filter((attempt) => attempt.id !== pendingId),
      }));
      if (!result.ok || !result.id) return result;
      router.refresh();
      return result;
    },
    [commitGuest, guest, router, state.attempts],
  );

  const setPlanExtensionYears = useCallback(
    async (extensionYears: number) => {
      const nextExtensionYears = Math.max(0, Math.min(10, extensionYears));

      const result = guest
        ? commitGuest(
            (current) => ({
              ...current,
              profile: {
                ...current.profile,
                extensionYears: nextExtensionYears,
              },
            }),
            "Plan timeline updated",
          )
        : await setCurrentUserPlanExtensionYears(nextExtensionYears);
      if (!result.ok) return result;
      setState((current) => ({
        ...current,
        profile: {
          ...current.profile,
          extensionYears: nextExtensionYears,
        },
      }));
      return {
        ok: true,
        message:
          nextExtensionYears === 0
            ? "Plan timeline restored to the programme duration"
            : `Plan extended by ${nextExtensionYears} ${nextExtensionYears === 1 ? "year" : "years"}`,
      };
    },
    [commitGuest, guest],
  );

  const reorderAttempt = useCallback(
    async (attemptId: string, termId: string, beforeAttemptId?: string) => {
      const previousAttempts = state.attempts;
      if (guest) {
        const result = commitGuest(
          (current) => ({
            ...current,
            attempts: moveAttempt(
              current.attempts,
              attemptId,
              termId,
              beforeAttemptId,
            ),
          }),
          "Course moved",
        );
        const moved = previousAttempts.find(
          (attempt) => attempt.id === attemptId,
        );
        // Another year's version may not be in the loaded catalogue yet.
        if (
          result.ok &&
          moved &&
          moved.academicYear !== courseYearForTerm(termId, moved.academicYear)
        )
          router.refresh();
        return result;
      }
      setState((current) => ({
        ...current,
        attempts: moveAttempt(
          current.attempts,
          attemptId,
          termId,
          beforeAttemptId,
        ),
      }));

      const result = await movePlanCourse(attemptId, termId, beforeAttemptId);
      if (!result.ok) {
        setState((current) => {
          const previous = previousAttempts.find(
            (item) => item.id === attemptId,
          );
          if (
            !previous ||
            !current.attempts.some((item) => item.id === attemptId)
          )
            return current;
          const previousIndex = previousAttempts.findIndex(
            (item) => item.id === attemptId,
          );
          const nextId = previousAttempts
            .slice(previousIndex + 1)
            .find(
              (item) =>
                item.termId === previous.termId &&
                current.attempts.some(
                  (attempt) =>
                    attempt.id === item.id &&
                    attempt.termId === previous.termId,
                ),
            )?.id;
          return {
            ...current,
            attempts: moveAttempt(
              current.attempts,
              attemptId,
              previous.termId,
              nextId,
            ).map((item) => (item.id === attemptId ? previous : item)),
          };
        });
        return result;
      }
      const moved = previousAttempts.find(
        (attempt) => attempt.id === attemptId,
      );
      // Another year's version may not be in the loaded catalogue yet.
      if (
        moved &&
        moved.academicYear !== courseYearForTerm(termId, moved.academicYear)
      ) {
        router.refresh();
      }
      return result;
    },
    [commitGuest, guest, router, state.attempts],
  );

  const updateAttempt = useCallback(
    async (
      attemptId: string,
      status: AttemptStatus,
      mark?: number,
      attemptedUnits?: number,
    ) => {
      const attempt = state.attempts.find((item) => item.id === attemptId);
      if (!attempt)
        return { ok: false, message: "That course is no longer in your plan" };
      if (attempt.status !== "planned") {
        return {
          ok: false,
          message: "Recorded attempts stay in your academic history",
        };
      }
      if (status === "planned") {
        return {
          ok: false,
          message: "Recorded attempts stay in your academic history",
        };
      }
      const savedMark =
        status === "completed" || status === "failed" ? mark : undefined;
      if (guest) {
        const units = attemptedUnits ?? attempt.unitsAttempted;
        return commitGuest(
          (current) => ({
            ...current,
            attempts: current.attempts.map((item) =>
              item.id === attemptId
                ? {
                    ...item,
                    status,
                    mark: savedMark,
                    unitsAttempted: units,
                    unitsEarned:
                      units === undefined
                        ? undefined
                        : status === "completed"
                          ? units
                          : 0,
                  }
                : item,
            ),
          }),
          "Academic history updated",
        );
      }
      const result = await recordCourseAttempt(
        attemptId,
        status,
        savedMark,
        attemptedUnits ?? attempt.unitsAttempted,
      );
      if (!result.ok) return result;
      const storedUnitsAttempted =
        result.unitsAttempted ?? attemptedUnits ?? attempt.unitsAttempted;
      const storedUnitsEarned =
        result.unitsEarned ??
        (status === "completed"
          ? storedUnitsAttempted
          : storedUnitsAttempted === undefined
            ? attempt.unitsEarned
            : 0);
      setState((current) => ({
        ...current,
        attempts: current.attempts.map((attempt) =>
          attempt.id === attemptId
            ? {
                ...attempt,
                id: result.id ?? attempt.id,
                snapshotId: result.snapshotId ?? attempt.snapshotId,
                status,
                mark: savedMark,
                unitsAttempted: storedUnitsAttempted,
                unitsEarned: storedUnitsEarned,
              }
            : attempt,
        ),
      }));
      return result;
    },
    [commitGuest, guest, state.attempts],
  );

  const removeAttempt = useCallback(
    async (attemptId: string) => {
      const attempt = state.attempts.find((item) => item.id === attemptId);
      if (
        attempt?.status === "completed" ||
        attempt?.status === "failed" ||
        attempt?.status === "withdrawn"
      ) {
        return {
          ok: false,
          message: "Recorded attempts stay in your academic history",
        };
      }
      if (!attempt)
        return { ok: false, message: "That course is no longer in your plan" };
      if (guest) {
        return commitGuest(
          (current) => ({
            ...current,
            attempts: current.attempts.filter((item) => item.id !== attemptId),
          }),
          "Course removed from the plan",
        );
      }
      // An enrolment is a recorded attempt rather than a plan item, and has
      // no result yet, so it is removed from the academic record instead.
      const result =
        attempt.status === "enrolled"
          ? await saveAcademicResult(attemptId, "remove").then((response) => ({
              ok: response.ok,
              message: response.ok
                ? "Course removed from the plan"
                : response.message,
            }))
          : await removePlanCourse(attemptId);
      if (!result.ok) return result;
      setState((current) => ({
        ...current,
        attempts: current.attempts.filter((item) => item.id !== attemptId),
      }));
      return result;
    },
    [commitGuest, guest, state.attempts],
  );

  const togglePermission = useCallback((attemptId: string) => {
    setState((current) => ({
      ...current,
      attempts: current.attempts.map((attempt) =>
        attempt.id === attemptId
          ? { ...attempt, permissionApproved: !attempt.permissionApproved }
          : attempt,
      ),
    }));
  }, []);

  const setPlacement = useCallback(
    async (
      courseCode: string,
      placement: { structureCode: string; requirementKey: string } | null,
    ) => {
      const previous = state.placements ?? [];
      const others = previous.filter(
        (choice) => choice.courseCode !== courseCode,
      );
      if (guest) {
        return commitGuest(
          (current) => ({
            ...current,
            placements: placement
              ? [...others, { courseCode, ...placement }]
              : others,
          }),
          placement
            ? `${courseCode} moved`
            : `${courseCode} placed automatically`,
        );
      }
      // The page reallocates at once; a failed save puts the choice back.
      setState((current) => ({
        ...current,
        placements: placement
          ? [
              ...(current.placements ?? []).filter(
                (choice) => choice.courseCode !== courseCode,
              ),
              { courseCode, ...placement },
            ]
          : (current.placements ?? []).filter(
              (choice) => choice.courseCode !== courseCode,
            ),
      }));
      const result = await setRequirementPlacement(courseCode, placement);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          placements: [
            ...(current.placements ?? []).filter(
              (choice) => choice.courseCode !== courseCode,
            ),
            ...previous.filter((choice) => choice.courseCode === courseCode),
          ],
        }));
      }
      return result;
    },
    [commitGuest, guest, state.placements],
  );

  const toggleStar = useCallback(
    async (courseCode: string) => {
      const previous = state.starredCourses ?? [];
      const starred = !previous.includes(courseCode);
      if (guest) {
        return commitGuest(
          (current) => ({
            ...current,
            starredCourses: starred
              ? [...previous, courseCode]
              : previous.filter((code) => code !== courseCode),
          }),
          starred ? `${courseCode} starred` : `${courseCode} unstarred`,
        );
      }
      // The star shows at once; a failed save takes it back.
      setState((current) => ({
        ...current,
        starredCourses: starred
          ? [
              ...(current.starredCourses ?? []).filter(
                (code) => code !== courseCode,
              ),
              courseCode,
            ]
          : (current.starredCourses ?? []).filter(
              (code) => code !== courseCode,
            ),
      }));
      const result = await setCourseStar(courseCode, starred);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          starredCourses: [
            ...(current.starredCourses ?? []).filter(
              (code) => code !== courseCode,
            ),
            ...(starred ? [] : [courseCode]),
          ],
        }));
      }
      return result;
    },
    [commitGuest, guest, state.starredCourses],
  );

  const toggleOverloadApproval = useCallback((attemptId: string) => {
    setState((current) => ({
      ...current,
      attempts: current.attempts.map((attempt) =>
        attempt.id === attemptId
          ? { ...attempt, overloadApproved: !attempt.overloadApproved }
          : attempt,
      ),
    }));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      ready,
      canAccessAdmin,
      guest,
      leaveGuestMode,
      saveGuestResult,
      updateProfile,
      setPlanExtensionYears,
      addCourse,
      reorderAttempt,
      updateAttempt,
      removeAttempt,
      setPlacement,
      toggleStar,
      togglePermission,
      toggleOverloadApproval,
      notify,
    }),
    [
      state,
      ready,
      canAccessAdmin,
      guest,
      leaveGuestMode,
      saveGuestResult,
      updateProfile,
      setPlanExtensionYears,
      addCourse,
      reorderAttempt,
      updateAttempt,
      removeAttempt,
      setPlacement,
      toggleStar,
      togglePermission,
      toggleOverloadApproval,
      notify,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {renderGlobalUi ? (
        <AppGlobalUi
          authenticated={Boolean(viewer)}
          guest={guest}
          guestPlanToTransfer={guestPlanToTransfer}
        />
      ) : null}
    </AppContext.Provider>
  );
}

export function useCoursemap() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useCoursemap must be used within AppProvider");
  return context;
}
