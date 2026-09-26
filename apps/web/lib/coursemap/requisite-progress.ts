import "server-only";
import { getAuthViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { CompletedRequisiteCourse } from "./requisite-summary";

export type RequisiteCompletionSnapshot = {
  completedCourses: CompletedRequisiteCourse[];
  /** Codes of the programmes on the viewer's primary plan. */
  enrolledProgrammeCodes: string[];
  isAuthenticated: boolean;
};

type AttemptRow = {
  catalogue_version_id: number;
  units_earned: number;
};

type CourseRow = { code: string; id: number };

/**
 * This intentionally reads only completed attempts. A planned or enrolled
 * course can help a plan, but cannot satisfy wording that requires completion.
 */
export async function loadCurrentUserRequisiteCompletion(): Promise<RequisiteCompletionSnapshot> {
  const viewer = await getAuthViewer();
  if (!viewer) {
    return {
      completedCourses: [],
      enrolledProgrammeCodes: [],
      isAuthenticated: false,
    };
  }

  try {
    const supabase = await createClient();
    const { data: attempts, error: attemptsError } = await supabase
      .from("course_attempts")
      .select("catalogue_version_id,units_earned")
      .eq("owner_id", viewer.id)
      .eq("status", "completed");
    if (attemptsError) throw attemptsError;

    const attemptRows = (attempts ?? []) as AttemptRow[];
    const versionIds = attemptRows.map(
      (attempt) => attempt.catalogue_version_id,
    );
    const { data: versions, error: versionsError } = versionIds.length
      ? await supabase
          .from("catalogue_versions")
          .select("id,record_id")
          .in("id", versionIds)
      : { data: [], error: null };
    if (versionsError) throw versionsError;
    const recordIds = (versions ?? []).map((version) => version.record_id);
    const { data: records, error: recordsError } = recordIds.length
      ? await supabase
          .from("catalogue_records")
          .select("id,code_id")
          .in("id", recordIds)
      : { data: [], error: null };
    if (recordsError) throw recordsError;
    const codeIdByRecordId = new Map(
      (records ?? []).map((record) => [record.id, record.code_id]),
    );
    const codeIdByVersionId = new Map(
      (versions ?? []).map((version) => [
        version.id,
        codeIdByRecordId.get(version.record_id),
      ]),
    );
    const courseIds = [...new Set(codeIdByRecordId.values())];
    const { data: courses, error: coursesError } = courseIds.length
      ? await supabase
          .from("catalogue_codes")
          .select("code,id")
          .in("id", courseIds)
      : { data: [], error: null };
    if (coursesError) throw coursesError;

    const codeByCourseId = new Map(
      ((courses ?? []) as CourseRow[]).map((course) => [
        course.id,
        course.code,
      ]),
    );
    // A tagged-units rule counts the tags of the version actually completed.
    const { data: tagRows, error: tagsError } = versionIds.length
      ? await supabase
          .from("course_tags")
          .select("version_id,name")
          .in("version_id", versionIds)
      : { data: [], error: null };
    if (tagsError) throw tagsError;
    const tagsByVersionId = new Map<number, string[]>();
    for (const row of tagRows ?? []) {
      tagsByVersionId.set(row.version_id, [
        ...(tagsByVersionId.get(row.version_id) ?? []),
        row.name,
      ]);
    }
    return {
      completedCourses: attemptRows.flatMap((attempt) => {
        const codeId = codeIdByVersionId.get(attempt.catalogue_version_id);
        const code = codeId ? codeByCourseId.get(codeId) : undefined;
        return code && attempt.units_earned > 0
          ? [
              {
                code,
                units: attempt.units_earned,
                tags: tagsByVersionId.get(attempt.catalogue_version_id) ?? [],
              },
            ]
          : [];
      }),
      enrolledProgrammeCodes: await loadEnrolledProgrammeCodes(
        supabase,
        viewer.id,
      ),
      isAuthenticated: true,
    };
  } catch {
    return {
      completedCourses: [],
      enrolledProgrammeCodes: [],
      isAuthenticated: true,
    };
  }
}

/**
 * Programme enrolment is read from the viewer's primary plan, which is the
 * only place Coursemap records what someone is enrolled in.
 */
async function loadEnrolledProgrammeCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
): Promise<string[]> {
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_primary", true)
    .maybeSingle();
  if (planError || !plan) return [];

  const { data: planStructures, error: planStructuresError } = await supabase
    .from("plan_structures")
    .select("catalogue_record_id")
    .eq("plan_id", plan.id)
    .eq("role", "programme");
  if (planStructuresError) return [];
  const structureYearIds = (planStructures ?? []).map(
    (row) => row.catalogue_record_id,
  );
  if (structureYearIds.length === 0) return [];

  const { data: structureYears, error: structureYearsError } = await supabase
    .from("catalogue_records")
    .select("code_id")
    .in("id", structureYearIds);
  if (structureYearsError) return [];
  const structureIds = [
    ...new Set(
      (structureYears ?? []).map((structureYear) => structureYear.code_id),
    ),
  ];
  if (structureIds.length === 0) return [];

  const { data: structures, error: structuresError } = await supabase
    .from("catalogue_codes")
    .select("code")
    .in("id", structureIds);
  if (structuresError) return [];
  return (structures ?? []).map((structure) => structure.code.toUpperCase());
}
