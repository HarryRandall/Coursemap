"use server";

import { revalidatePath } from "next/cache";
import type { Profile } from "@/app/providers";
import type { AttemptStatus } from "@/lib/coursemap/types";
import { createClient } from "@/lib/supabase/server";

export type CoursemapActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  snapshotId?: number;
  unitsAttempted?: number;
  unitsEarned?: number;
};

const STUDENT_NUMBER_PATTERN = /^u\d{7}$/;

function normaliseStudentNumber(value: string) {
  const studentNumber = value.trim().toLowerCase();
  if (!studentNumber) return "";
  if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) {
    throw new Error(
      "Enter a student number in the format u1234567, or leave it blank.",
    );
  }
  return studentNumber;
}

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
      : "Coursemap could not save that change.";
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
    return { ok: true, id: data, message: "Profile and academic plan saved" };
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
    return data
      ? { ok: true, message: "Course removed from the plan" }
      : { ok: false, message: "Course was not found in your plan" };
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
