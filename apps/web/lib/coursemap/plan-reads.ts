import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// These private reads are memoised only for the current React server request.
export const loadPrimaryPlan = cache(async (ownerId: string) => {
  const supabase = await createClient();
  const result = await supabase
    .from("plans")
    .select(
      "academic_year_id,id,commencement_year,enrolment_mode,study_load,extension_years",
    )
    .eq("owner_id", ownerId)
    .eq("is_primary", true)
    .maybeSingle();
  return result;
});

export const loadPlanItems = cache(async (planId: string) => {
  const supabase = await createClient();
  const result = await supabase
    .from("plan_items")
    .select(
      "id,catalogue_record_id,planned_calendar_year,planned_period_code,sort_order",
    )
    .eq("plan_id", planId)
    .order("sort_order");
  return result;
});

export const loadPlanStructures = cache(async (planId: string) => {
  const supabase = await createClient();
  const result = await supabase
    .from("plan_structures")
    .select("role,catalogue_record_id")
    .eq("plan_id", planId)
    .order("position");
  return result;
});

export const loadCourseAttempts = cache(async (ownerId: string) => {
  const supabase = await createClient();
  const result = await supabase
    .from("course_attempts")
    .select(
      "id,catalogue_version_id,academic_period_id,status,mark,grade,units_attempted,units_earned",
    )
    .eq("owner_id", ownerId)
    .order("created_at");
  return result;
});

export const loadPlanYear = cache(async (academicYearId: number) => {
  const supabase = await createClient();
  const result = await supabase
    .from("academic_years")
    .select("year")
    .eq("id", academicYearId)
    .maybeSingle();
  return result;
});

const readAttemptVersions = cache(async (versionIds: string) => {
  const supabase = await createClient();
  const result = await supabase
    .from("catalogue_versions")
    .select("id,record_id,academic_year_id")
    .in("id", versionIds.split(",").map(Number));
  return result;
});

export function loadAttemptVersions(versionIds: readonly number[]) {
  // React compares cache arguments by identity, so normalise equivalent id lists.
  return readAttemptVersions(
    [...new Set(versionIds)].sort((a, b) => a - b).join(","),
  );
}
