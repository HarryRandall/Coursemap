"use client";
import { useInputModality } from "@/lib/browser/use-input-modality";
import { Toaster } from "@coursemap/ui/primitives/sonner";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { AuthViewer } from "@/lib/auth/viewer";
import type { AppState, AttemptStatus, Profile } from "@/lib/coursemap/types";

export type { AppState, Profile } from "@/lib/coursemap/types";
import {
  addPlanCourse,
  movePlanCourse,
  recordCourseAttempt,
  removePlanCourse,
  saveProfileAndPlan,
  setCurrentUserPlanExtensionYears,
  type CoursemapActionResult,
} from "@/lib/coursemap/actions";

type ToastTone = "success" | "warning" | "info" | "error";

type AppContextValue = {
  state: AppState;
  ready: boolean;
  canAccessAdmin: boolean;
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
  togglePermission: (attemptId: string) => void;
  toggleOverloadApproval: (attemptId: string) => void;
  notify: (message: string, tone?: ToastTone) => void;
};

function createInitialState(viewer: AuthViewer | null) {
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

export function AppProvider({
  children,
  viewer,
  canAccessAdmin,
  initialState: suppliedInitialState,
}: {
  children: React.ReactNode;
  viewer: AuthViewer | null;
  canAccessAdmin: boolean;
  initialState?: AppState;
}) {
  useInputModality();
  const router = useRouter();
  // The vendored Toaster reads the stored theme, which ignores a forced one.
  const { forcedTheme, resolvedTheme } = useTheme();
  const toastTheme = forcedTheme ?? resolvedTheme;
  const initialState = useMemo(
    () => suppliedInitialState ?? createInitialState(viewer),
    [suppliedInitialState, viewer],
  );
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    window.queueMicrotask(() => {
      if (!cancelled) {
        setState(initialState);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialState]);

  useEffect(() => {
    if (!viewer) return;

    const refreshRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", refreshRestoredPage);
    return () => window.removeEventListener("pageshow", refreshRestoredPage);
  }, [viewer]);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    if (tone === "error") toast.error(message);
    else if (tone === "warning") toast.warning(message);
    else if (tone === "info") toast.info(message);
    else toast.success(message);
  }, []);

  const updateProfile = useCallback(
    async (profile: Partial<Profile>) => {
      const nextProfile = { ...state.profile, ...profile };

      const result = await saveProfileAndPlan(nextProfile);
      if (!result.ok) return result;
      setState((current) => ({ ...current, profile: nextProfile }));
      return { ok: true, message: "Profile and academic plan saved" };
    },
    [state.profile],
  );

  const addCourse = useCallback(
    async (courseCode: string, termId: string, academicYear: number) => {
      const occurrenceCount = state.attempts.filter(
        (attempt) => attempt.courseCode === courseCode,
      ).length;
      if (occurrenceCount >= 1) {
        return { ok: false, message: `${courseCode} is already in your plan` };
      }
      const result = await addPlanCourse(courseCode, termId, academicYear);
      if (!result.ok || !result.id) return result;
      setState((current) => ({
        ...current,
        attempts: [
          ...current.attempts,
          {
            id: result.id!,
            academicYear,
            courseCode,
            termId,
            status: "planned",
          },
        ],
      }));
      router.refresh();
      return result;
    },
    [router, state.attempts],
  );

  const setPlanExtensionYears = useCallback(async (extensionYears: number) => {
    const nextExtensionYears = Math.max(0, Math.min(10, extensionYears));

    const result = await setCurrentUserPlanExtensionYears(nextExtensionYears);
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
  }, []);

  const reorderAttempt = useCallback(
    async (attemptId: string, termId: string, beforeAttemptId?: string) => {
      const previousAttempts = state.attempts;
      setState((current) => {
        const moving = current.attempts.find(
          (attempt) => attempt.id === attemptId,
        );
        if (!moving || beforeAttemptId === attemptId) return current;

        const remaining = current.attempts.filter(
          (attempt) => attempt.id !== attemptId,
        );
        const next = { ...moving, termId };
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

        return { ...current, attempts: remaining };
      });

      const result = await movePlanCourse(attemptId, termId, beforeAttemptId);
      if (!result.ok) {
        setState((current) => ({ ...current, attempts: previousAttempts }));
      }
      return result;
    },
    [state.attempts],
  );

  const updateAttempt = useCallback(
    async (
      attemptId: string,
      status: AttemptStatus,
      mark?: number,
      attemptedUnits?: number,
    ) => {
      const attempt = state.attempts.find((item) => item.id === attemptId);
      if (!attempt) return { ok: false, message: "Course was not found" };
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
    [state.attempts],
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
      if (!attempt) return { ok: false, message: "Course was not found" };
      const result = await removePlanCourse(attemptId);
      if (!result.ok) return result;
      setState((current) => ({
        ...current,
        attempts: current.attempts.filter((item) => item.id !== attemptId),
      }));
      return result;
    },
    [state.attempts],
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
      updateProfile,
      setPlanExtensionYears,
      addCourse,
      reorderAttempt,
      updateAttempt,
      removeAttempt,
      togglePermission,
      toggleOverloadApproval,
      notify,
    }),
    [
      state,
      ready,
      canAccessAdmin,
      updateProfile,
      setPlanExtensionYears,
      addCourse,
      reorderAttempt,
      updateAttempt,
      removeAttempt,
      togglePermission,
      toggleOverloadApproval,
      notify,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <Toaster
        theme={
          toastTheme === "dark" || toastTheme === "light"
            ? toastTheme
            : "system"
        }
        position="top-center"
        style={{ "--width": "560px" } as CSSProperties}
        closeButton
        visibleToasts={3}
      />
    </AppContext.Provider>
  );
}

export function useCoursemap() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useCoursemap must be used within AppProvider");
  return context;
}
