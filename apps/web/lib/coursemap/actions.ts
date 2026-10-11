"use server";

import { revalidatePath } from "next/cache";
import { normaliseStudentNumber } from "@/lib/coursemap/student-number";
import { validPlanOverride, validCreditedUnits } from "./plan-overrides";
import type { PlanOverride, RequirementOverride } from "./types";
import type { AttemptStatus, Profile } from "@/lib/coursemap/types";
import { publicErrorMessage } from "@/lib/public-errors";
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
  const match = /^(\d{4})-([a-z0-9-]+)$/i.exec(termId);
  if (!match) throw new Error("That study period is not valid.");
  return { year: Number(match[1]), period: match[2].toUpperCase() };
}

/**
 * SQLSTATEs the planning functions raise with text written for the student,
 * including messages built with format(). PostgreSQL's own errors under these
 * codes describe the request rather than the schema; permission (42501) and
 * constraint errors can name tables, so they are never passed through.
 */
const STUDENT_FACING_SQLSTATES = new Set(["22023", "28000", "40001", "P0002"]);

/** Messages the planning functions raise for the student under other codes. */
const PLANNING_MESSAGES = new Set([
  "A course academic year is required.",
  "A selected academic structure changed while the plan was being saved. Please try again.",
  "Attempt mark must be between 0 and 100.",
  "Attempt status must be enrolled, completed or failed.",
  "Attempted units cannot change after an attempt is recorded.",
  "Attempted units must be a positive value with at most two decimal places.",
  "Attempted units must be within the published course range.",
  "Attempted units must match a published course unit option.",
  "Attempted units must match the fixed course value.",
  "Authentication is required.",
  "Choose a valid enrolment mode.",
  "Choose the attempted units for this course.",
  "Display name is required.",
  "Plan extensions must be between zero and ten years.",
  "Plan item not found.",
  "Planned year and period must be supplied together.",
  "Save a primary degree plan before adding courses.",
  "Schedule the course in an academic period before recording an attempt.",
  "Select each academic structure only once.",
  "Selected minor and specialisation codes cannot be blank.",
  "That study period is not valid.",
  "The academic period is not available for recorded history.",
  "The authenticated profile is missing.",
  "The course has no published units for the attempted year.",
  "The plan could not be updated.",
  "The requested destination item was not found.",
  "The selected academic year is not available.",
  "The selected programme does not include duration or unit information for planning.",
  "The selected programme is not published for that academic year.",
  "You must be signed in to update a plan.",
  "Your primary plan was not found.",
]);

/** The format() templates, for errors that arrive without their SQLSTATE. */
const PLANNING_MESSAGE_PATTERNS = [
  /^\S+ for \d* ?isn't imported yet\.$/u,
  /^The selected [a-z]+ is not published for that academic year\.$/u,
  /^The selected [a-z]+ is not an explicit option for that programme\.$/u,
];

function isStudentFacing(error: unknown, message: string) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return (
    (typeof code === "string" && STUDENT_FACING_SQLSTATES.has(code)) ||
    PLANNING_MESSAGES.has(message) ||
    PLANNING_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  );
}

function failure(error: unknown): CoursemapActionResult {
  const rawMessage =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (rawMessage.includes("profiles_student_number_format_check"))
    return {
      ok: false,
      message:
        "Enter a student number in the format u1234567, or leave it blank.",
    };
  if (rawMessage && isStudentFacing(error, rawMessage))
    return { ok: false, message: rawMessage };
  return {
    ok: false,
    message: publicErrorMessage(error, "Couldn't save that change. Try again."),
  };
}

export async function saveProfileAndPlan(
  profile: Profile,
): Promise<CoursemapActionResult> {
  try {
    if (
      (profile.preferredName?.trim().length ?? 0) > 80 ||
      (profile.pronouns?.trim().length ?? 0) > 40
    ) {
      return {
        ok: false,
        message:
          "Use up to 80 characters for your preferred name and 40 for your pronouns.",
      };
    }
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
      "save_current_user_primary_plan_with_enrolment_mode",
      {
        p_display_name: profile.name,
        p_student_number: studentNumber,
        p_academic_year: profile.catalogueYear,
        p_commencement_year: profile.commencementYear,
        p_enrolment_mode: profile.enrolmentMode ?? undefined,
        p_study_load:
          profile.studyLoad === "Part time" ? "part_time" : "full_time",
        p_programme_code: profile.degreeCode,
        p_major_code: profile.majorCode || undefined,
        p_minor_codes: profile.minorCodes,
        p_specialisation_codes: profile.specialisationCodes,
      },
    );
    if (error) throw error;
    const { data: claims } = await supabase.auth.getClaims();
    const ownerId = claims?.claims.sub;
    if (ownerId) {
      // Optional details the plan RPC does not take; blank clears them.
      const { error: detailsError } = await supabase
        .from("profiles")
        .update({
          preferred_name: profile.preferredName?.trim() || null,
          pronouns: profile.pronouns?.trim() || null,
        })
        .eq("id", ownerId);
      if (detailsError) throw detailsError;
    }
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
    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
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
    if (data) revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
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

async function overridePlan() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Sign in to change your plan.");
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id")
    .eq("owner_id", user.id)
    .eq("is_primary", true)
    .single();
  if (error) throw error;
  return { supabase, planId: plan.id, ownerId: user.id };
}

export async function setCourseOverride(
  courseCode: string,
  override: PlanOverride | null,
): Promise<CoursemapActionResult> {
  if (
    !/^[A-Z]{4}\d{4}[A-Z]?$/.test(courseCode) ||
    (override !== null && !validPlanOverride(override))
  )
    return {
      ok: false,
      message: "Choose a valid reason and a note of at most 500 characters.",
    };
  try {
    const { supabase, planId, ownerId } = await overridePlan();
    const { error } = override
      ? await supabase.from("plan_course_overrides").upsert(
          {
            plan_id: planId,
            owner_id: ownerId,
            course_code: courseCode,
            reason: override.reason,
            note: override.note ?? null,
          },
          { onConflict: "plan_id,course_code" },
        )
      : await supabase
          .from("plan_course_overrides")
          .delete()
          .eq("plan_id", planId)
          .eq("course_code", courseCode);
    if (error) throw error;
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: override ? "Course bypass saved." : "Course bypass removed.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function setRequirementOverride(
  structureCode: string,
  requirementKey: string,
  override: Omit<
    RequirementOverride,
    "structureCode" | "requirementKey"
  > | null,
): Promise<CoursemapActionResult> {
  if (
    !/^[A-Za-z0-9_-]{1,32}$/.test(structureCode) ||
    !requirementKey.trim() ||
    requirementKey.length > 200 ||
    (override !== null &&
      (!validPlanOverride(override) ||
        !validCreditedUnits(override.creditedUnits)))
  )
    return {
      ok: false,
      message:
        "Choose a valid reason, note and whole number of credited units.",
    };
  try {
    const { supabase, planId, ownerId } = await overridePlan();
    const { error } = override
      ? await supabase.from("plan_requirement_overrides").upsert(
          {
            plan_id: planId,
            owner_id: ownerId,
            structure_code: structureCode,
            requirement_key: requirementKey,
            reason: override.reason,
            note: override.note ?? null,
            credited_units: override.creditedUnits ?? null,
          },
          { onConflict: "plan_id,structure_code,requirement_key" },
        )
      : await supabase
          .from("plan_requirement_overrides")
          .delete()
          .eq("plan_id", planId)
          .eq("structure_code", structureCode)
          .eq("requirement_key", requirementKey);
    if (error) throw error;
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: override
        ? "Requirement marked satisfied."
        : "Requirement override removed.",
    };
  } catch (error) {
    return failure(error);
  }
}
