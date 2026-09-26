import type { AppState } from "@/lib/coursemap/types";
import type { AuthViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

type PlanItemRow = {
  catalogue_record_id: number;
  id: string;
  planned_calendar_year: number | null;
  planned_period_code: string | null;
};

type CourseAttemptRow = {
  academic_period_id: number;
  catalogue_version_id: number;
  id: string;
  mark: number | null;
  grade?: string | null;
  status: string;
  units_attempted: number;
  units_earned: number;
};

export function emptyCoursemapState(viewer: AuthViewer): AppState {
  return {
    schemaVersion: 1,
    profile: {
      name: "",
      studentId: "",
      email: viewer.email ?? "",
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
  };
}

export async function hasPrimaryPlan(viewer: AuthViewer) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select("id")
      .eq("owner_id", viewer.id)
      .eq("is_primary", true)
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export type PlanStructureSelection = {
  role: string;
  catalogue_record_id: number;
};

/**
 * Resolves a plan's selected structures into the codes the profile stores.
 * A structure without a resolvable code is dropped rather than recorded as a
 * blank selection, and every minor and specialisation is kept.
 */
export function planStructureCodes(
  structures: readonly PlanStructureSelection[],
  codeByYear: ReadonlyMap<number, string | undefined>,
  fallback: { degreeCode: string },
) {
  const codesFor = (role: string) =>
    structures.flatMap((item) => {
      if (item.role !== role) return [];
      const code = codeByYear.get(item.catalogue_record_id);
      return code ? [code] : [];
    });
  const codeForFirst = (role: string) =>
    codeByYear.get(
      structures.find((item) => item.role === role)?.catalogue_record_id ?? -1,
    );

  return {
    degreeCode: codeForFirst("programme") ?? fallback.degreeCode,
    majorCode: codeForFirst("major") ?? "",
    minorCodes: codesFor("minor"),
    specialisationCodes: codesFor("specialisation"),
  };
}

export async function loadCoursemapState(
  viewer: AuthViewer,
): Promise<AppState> {
  const fallback = emptyCoursemapState(viewer);

  try {
    const supabase = await createClient();
    const [{ data: profile }, { data: plan }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,student_number")
        .eq("id", viewer.id)
        .maybeSingle(),
      supabase
        .from("plans")
        .select(
          "academic_year_id,id,commencement_year,study_load,extension_years",
        )
        .eq("owner_id", viewer.id)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);

    const state: AppState = {
      ...fallback,
      profile: {
        ...fallback.profile,
        name: profile?.display_name ?? "",
        studentId: profile?.student_number ?? "",
      },
    };
    if (!plan) return state;

    const [
      yearResult,
      structuresResult,
      itemsResult,
      attemptsResult,
      placementsResult,
      starsResult,
    ] = await Promise.all([
      supabase
        .from("academic_years")
        .select("year")
        .eq("id", plan.academic_year_id)
        .maybeSingle(),
      supabase
        .from("plan_structures")
        .select("role,catalogue_record_id")
        .eq("plan_id", plan.id)
        .order("position"),
      supabase
        .from("plan_items")
        .select(
          "id,catalogue_record_id,planned_calendar_year,planned_period_code,sort_order",
        )
        .eq("plan_id", plan.id)
        .order("sort_order"),
      supabase
        .from("course_attempts")
        .select(
          "id,catalogue_version_id,academic_period_id,status,mark,grade,units_attempted,units_earned",
        )
        .eq("owner_id", viewer.id)
        .order("created_at"),
      supabase
        .from("plan_requirement_placements")
        .select("course_code,structure_code,requirement_key")
        .eq("plan_id", plan.id),
      supabase
        .from("plan_starred_courses")
        .select("course_code")
        .eq("plan_id", plan.id)
        .order("created_at"),
    ]);

    const structures = structuresResult.data ?? [];
    const items = (itemsResult.data ?? []) as unknown as PlanItemRow[];
    const attempts = (attemptsResult.data ??
      []) as unknown as CourseAttemptRow[];
    const periodIds = [
      ...new Set(attempts.map((item) => item.academic_period_id)),
    ];
    const snapshotIds = [
      ...new Set(attempts.map((item) => item.catalogue_version_id)),
    ];
    const [{ data: periods }, snapshotsResult] = await Promise.all([
      periodIds.length
        ? supabase
            .from("academic_periods")
            .select("id,calendar_year,code")
            .in("id", periodIds)
        : Promise.resolve({ data: [] }),
      snapshotIds.length
        ? supabase
            .from("catalogue_versions")
            .select("id,record_id,academic_year_id")
            .in("id", snapshotIds)
        : Promise.resolve({ data: [] }),
    ]);
    const recordIds = [
      ...new Set([
        ...structures.map((item) => item.catalogue_record_id),
        ...items.map((item) => item.catalogue_record_id),
        ...(snapshotsResult.data ?? []).map((version) => version.record_id),
      ]),
    ];
    const { data: records } = recordIds.length
      ? await supabase
          .from("catalogue_records")
          .select("id,code_id,academic_year_id")
          .in("id", recordIds)
      : { data: [] };
    const codeIds = [
      ...new Set((records ?? []).map((record) => record.code_id)),
    ];
    const { data: courseIdentities } = codeIds.length
      ? await supabase
          .from("catalogue_codes")
          .select("id,code")
          .in("id", codeIds)
      : { data: [] };
    const recordById = new Map(
      (records ?? []).map((record) => [record.id, record]),
    );
    const versionRecordId = new Map(
      (snapshotsResult.data ?? []).map((version) => [
        version.id,
        version.record_id,
      ]),
    );
    const academicYearIds = [
      ...new Set([
        ...(records ?? []).map((record) => record.academic_year_id),
        ...(snapshotsResult.data ?? []).map(
          (snapshot) => snapshot.academic_year_id,
        ),
      ]),
    ];
    const { data: academicYears } = academicYearIds.length
      ? await supabase
          .from("academic_years")
          .select("id,year")
          .in("id", academicYearIds)
      : { data: [] };
    const academicYearById = new Map(
      (academicYears ?? []).map((year) => [year.id, year.year]),
    );
    const snapshotAcademicYearId = new Map(
      (snapshotsResult.data ?? []).map((snapshot) => [
        snapshot.id,
        snapshot.academic_year_id,
      ]),
    );
    const courseCode = new Map(
      (courseIdentities ?? []).map((course) => [course.id, course.code]),
    );
    const structureCodeByYear = new Map(
      (records ?? []).map((record) => [
        record.id,
        courseCode.get(record.code_id),
      ]),
    );
    const periodById = new Map(
      (periods ?? []).map((period) => [period.id, period]),
    );

    const plannedAttempts = items.flatMap((item) => {
      const record = recordById.get(item.catalogue_record_id);
      const code = record ? courseCode.get(record.code_id) : undefined;
      if (!code) return [];
      return [
        {
          id: item.id,
          academicYear: record
            ? academicYearById.get(record.academic_year_id)
            : undefined,
          courseCode: code,
          termId:
            item.planned_calendar_year && item.planned_period_code
              ? `${item.planned_calendar_year}-${item.planned_period_code.toLowerCase()}`
              : "unscheduled",
          status: "planned" as const,
        },
      ];
    });
    const recordedAttempts = attempts.flatMap((attempt) => {
      const recordId = versionRecordId.get(attempt.catalogue_version_id);
      const record = recordId ? recordById.get(recordId) : undefined;
      const code = record ? courseCode.get(record.code_id) : undefined;
      const period = periodById.get(attempt.academic_period_id);
      if (
        !code ||
        !period ||
        !["completed", "failed", "enrolled", "withdrawn", "credited"].includes(
          attempt.status,
        )
      )
        return [];
      return [
        {
          id: attempt.id,
          academicYear: academicYearById.get(
            snapshotAcademicYearId.get(attempt.catalogue_version_id) ?? -1,
          ),
          courseCode: code,
          snapshotId: attempt.catalogue_version_id,
          termId: `${period.calendar_year}-${period.code.toLowerCase()}`,
          status: (attempt.status === "credited"
            ? "completed"
            : attempt.status) as
            "completed" | "failed" | "enrolled" | "withdrawn",
          mark: attempt.mark ?? undefined,
          resultCode: attempt.grade ?? undefined,
          unitsAttempted: Number(attempt.units_attempted),
          unitsEarned: Number(attempt.units_earned),
        },
      ];
    });

    return {
      schemaVersion: 1,
      profile: {
        ...state.profile,
        commencementYear: plan.commencement_year,
        catalogueYear: yearResult.data?.year ?? state.profile.catalogueYear,
        studyLoad: plan.study_load === "part_time" ? "Part time" : "Full time",
        extensionYears: plan.extension_years,
        ...planStructureCodes(structures, structureCodeByYear, {
          degreeCode: state.profile.degreeCode,
        }),
      },
      attempts: [...plannedAttempts, ...recordedAttempts],
      placements: (placementsResult.data ?? []).map((row) => ({
        courseCode: row.course_code,
        structureCode: row.structure_code,
        requirementKey: row.requirement_key,
      })),
      starredCourses: (starsResult.data ?? []).map((row) => row.course_code),
    };
  } catch {
    return fallback;
  }
}
