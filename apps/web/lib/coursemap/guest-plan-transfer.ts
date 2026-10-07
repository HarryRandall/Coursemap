"use server";

import { revalidatePath } from "next/cache";
import { getAuthViewer } from "@/lib/auth/viewer";
import {
  addPlanCourse,
  recordCourseAttempt,
  removePlanCourse,
  saveProfileAndPlan,
  setCourseStar,
  setCurrentUserPlanExtensionYears,
  setRequirementPlacement,
} from "@/lib/coursemap/actions";
import {
  clearGuestPlan,
  readGuestPlan,
} from "@/lib/coursemap/guest-plan-server";
import { hasPrimaryPlan, loadCoursemapState } from "@/lib/coursemap/state";
import { createClient } from "@/lib/supabase/server";

export type GuestPlanTransferChoice =
  /** Move the plan only into an account that has none yet. */
  | "if-empty"
  /** Replace the account's planned courses with the guest plan. */
  | "replace"
  | "discard";

export type GuestPlanTransferResult =
  | { status: "imported"; message: string }
  | { status: "conflict" }
  | { status: "done" }
  | { status: "failed"; message: string };

async function removePlannedCourses(ownerId: string) {
  const supabase = await createClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_primary", true)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) return;
  const { data: items, error: itemsError } = await supabase
    .from("plan_items")
    .select("id")
    .eq("plan_id", plan.id);
  if (itemsError) throw itemsError;
  for (const item of items ?? []) {
    const removed = await removePlanCourse(item.id);
    if (!removed.ok) throw new Error(removed.message);
  }
}

/**
 * Moves the plan a student made as a guest into the account they have just
 * signed in to, then forgets the browser copy. Recorded results in the
 * account are never removed; replacing only clears planned courses.
 */
export async function transferGuestPlan(
  choice: GuestPlanTransferChoice,
): Promise<GuestPlanTransferResult> {
  if (!["if-empty", "replace", "discard"].includes(choice)) {
    return { status: "failed", message: "Choose how to save your guest plan." };
  }
  try {
    const viewer = await getAuthViewer();
    if (!viewer)
      return { status: "failed", message: "Sign in to save your guest plan." };
    const guest = await readGuestPlan();
    if (!guest) return { status: "done" };
    // A guest who never chose a degree has nothing worth keeping.
    if (choice === "discard" || !guest.profile.degreeCode) {
      await clearGuestPlan();
      return { status: "done" };
    }

    const accountHasPlan = await hasPrimaryPlan(viewer);
    if (accountHasPlan && choice === "if-empty") return { status: "conflict" };

    const account = await loadCoursemapState(viewer);
    const saved = await saveProfileAndPlan({
      ...guest.profile,
      name: guest.profile.name || account.profile.name,
      studentId: guest.profile.studentId || account.profile.studentId,
      email: viewer.email ?? "",
    });
    if (!saved.ok) return { status: "failed", message: saved.message };
    if (accountHasPlan) await removePlannedCourses(viewer.id);
    let skipped = 0;
    const extension = await setCurrentUserPlanExtensionYears(
      guest.profile.extensionYears,
    );
    if (!extension.ok) skipped += 1;

    // Courses the account already recorded a result for stay as they are.
    const recorded = new Set(
      account.attempts
        .filter((attempt) => attempt.status !== "planned")
        .map((attempt) => attempt.courseCode),
    );
    for (const attempt of guest.attempts) {
      if (recorded.has(attempt.courseCode)) continue;
      const added = await addPlanCourse(
        attempt.courseCode,
        attempt.termId,
        attempt.academicYear ?? guest.profile.catalogueYear,
      );
      if (!added.ok || !added.id) {
        skipped += 1;
        continue;
      }
      if (attempt.status !== "planned") {
        const result = await recordCourseAttempt(
          added.id,
          attempt.status,
          attempt.mark,
          attempt.unitsAttempted,
        );
        if (!result.ok) skipped += 1;
      }
    }
    for (const code of guest.starredCourses ?? []) {
      if (!(await setCourseStar(code, true)).ok) skipped += 1;
    }
    for (const { courseCode, ...placement } of guest.placements ?? []) {
      if (!(await setRequirementPlacement(courseCode, placement)).ok)
        skipped += 1;
    }
    if (skipped > 0) {
      revalidatePath("/", "layout");
      return {
        status: "failed",
        message:
          "Some changes could not be moved. Your browser copy has been kept so you can try again.",
      };
    }

    await clearGuestPlan();
    revalidatePath("/", "layout");
    return {
      status: "imported",
      message: "Your guest plan is now saved to your account",
    };
  } catch {
    return {
      status: "failed",
      message:
        "Could not move your guest plan. Your browser copy has been kept. Try again.",
    };
  }
}
