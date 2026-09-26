"use server";

import { revalidatePath } from "next/cache";
import { normaliseStudentNumber } from "@/lib/coursemap/student-number";
import type { AttemptStatus, Profile } from "@/lib/coursemap/types";
import { createClient } from "@/lib/supabase/server";

export type CoursemapActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  snapshotId?: number;
  unitsAttempted?: number;
  unitsEarned?: number;
};

function termParts(termId: string) {
  if (termId === "unscheduled") {
    return { year: undefined, period: undefined };
  }

  const match = /^(\d{4})-([a-z0-9-]+)$/i.exec(termId);
  if (!match) throw new Error("That study period is not valid.");
  return { year: Number(match[1]), period: match[2].toUpperCase() };
}

function failure(error: unknown): CoursemapActionResult {
  const rawMessage =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Couldn't save that change. Try again.";
  const message = rawMessage.includes("profiles_student_number_format_check")
    ? "Enter a student number in the format u1234567, or leave it blank."
    : rawMessage;
  return { ok: false, message };
}

export async function saveProfileAndPlan(
  profile: Profile,
): Promise<CoursemapActionResult> {
  try {
    const studentNumber = normaliseStudentNumber(profile.studentId);
    if (studentNumber === null) {
      return {
        ok: false,
        message:
          "Enter a student number in the format u1234567, or leave it blank.",
      };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "save_current_user_primary_plan",
      {
        p_display_name: profile.name,
        p_student_number: studentNumber,
        p_academic_year: profile.catalogueYear,
        p_commencement_year: profile.commencementYear,
        p_study_load:
          profile.studyLoad === "Part time" ? "part_time" : "full_time",
        p_programme_code: profile.degreeCode,
        p_major_code: profile.majorCode || undefined,
        p_minor_codes: profile.minorCodes,
        p_specialisation_codes: profile.specialisationCodes,
      },
    );
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, id: data, message: "Profile saved" };
  } catch (error) {
    return failure(error);
  }
}

export async function addPlanCourse(
  courseCode: string,
  termId: string,
  academicYear: number,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { year, period } = termParts(termId);
    const { data, error } = await supabase.rpc("add_current_user_plan_item", {
      p_course_code: courseCode,
      p_academic_year: academicYear,
      p_planned_calendar_year: year,
      p_planned_period_code: period,
    });
    if (error) throw error;
    revalidatePath("/plan");
    return { ok: true, id: data, message: `${courseCode} added to the plan` };
  } catch (error) {
    return failure(error);
  }
}

export async function setCurrentUserPlanExtensionYears(
  extensionYears: number,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      "set_current_user_plan_extension_years",
      {
        p_extension_years: extensionYears,
      },
    );
    if (error) throw error;
    revalidatePath("/plan");
    revalidatePath("/dashboard");
    return { ok: true, message: "Plan timeline updated" };
  } catch (error) {
    return failure(error);
  }
}

export async function movePlanCourse(
  planItemId: string,
  termId: string,
  beforePlanItemId?: string,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { year, period } = termParts(termId);
    const { error } = await supabase.rpc("move_current_user_plan_item", {
      p_plan_item_id: planItemId,
      p_planned_calendar_year: year,
      p_planned_period_code: period,
      p_before_plan_item_id: beforePlanItemId,
    });
    if (error) throw error;
    revalidatePath("/plan");
    return { ok: true, message: "Course moved" };
  } catch (error) {
    return failure(error);
  }
}

export async function removePlanCourse(
  planItemId: string,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "remove_current_user_plan_item",
      { p_plan_item_id: planItemId },
    );
    if (error) throw error;
    if (data) revalidatePath("/plan");
    return data
      ? { ok: true, message: "Course removed from the plan" }
      : { ok: false, message: "That course is no longer in your plan" };
  } catch (error) {
    return failure(error);
  }
}

export async function recordCourseAttempt(
  planItemId: string,
  status: Exclude<AttemptStatus, "planned">,
  mark?: number,
  attemptedUnits?: number,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "record_current_user_course_attempt",
      {
        p_plan_item_id: planItemId,
        p_attempt_status: status,
        p_attempt_mark: mark,
        p_units_attempted: attemptedUnits,
      },
    );
    if (error) throw error;
    const { data: storedAttempt, error: storedAttemptError } = await supabase
      .from("course_attempts")
      .select("catalogue_version_id,units_attempted,units_earned")
      .eq("id", data)
      .single();
    if (storedAttemptError) throw storedAttemptError;
    revalidatePath("/plan");
    return {
      ok: true,
      id: data,
      message: "Academic history updated",
      snapshotId: storedAttempt.catalogue_version_id,
      unitsAttempted: Number(storedAttempt.units_attempted),
      unitsEarned: Number(storedAttempt.units_earned),
    };
  } catch (error) {
    return failure(error);
  }
}

/** Stars a course in the student's plan to consider later, or unstars it. */
export async function setCourseStar(
  courseCode: string,
  starred: boolean,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_current_user_course_star", {
      p_course_code: courseCode,
      p_starred: starred,
    });
    if (error) throw error;
    return {
      ok: true,
      message: starred ? `${courseCode} starred` : `${courseCode} unstarred`,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Counts a course towards a chosen part of the student's degree, or hands the
 * choice back to Coursemap when no requirement is given.
 */
export async function setRequirementPlacement(
  courseCode: string,
  placement: { structureCode: string; requirementKey: string } | null,
): Promise<CoursemapActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      "set_current_user_requirement_placement",
      {
        p_course_code: courseCode,
        p_structure_code: placement?.structureCode,
        p_requirement_key: placement?.requirementKey,
      },
    );
    if (error) throw error;
    revalidatePath("/requirements");
    return {
      ok: true,
      message: placement
        ? `${courseCode} moved`
        : `${courseCode} placed automatically`,
    };
  } catch (error) {
    return failure(error);
  }
}
