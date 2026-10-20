import "server-only";
import { getAuthViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { CompletedRequisiteCourse } from "./requisite-summary";
import type { ProgrammeCollege } from "@/lib/academic/college-enrolment";
import { courseFromSnapshotProjection } from "./published-courses";
import {
  loadAttemptCalendarYears,
  loadOwnedAttemptProjections,
  loadPublishedTdDesignations,
} from "./historical-td-evidence";
import {
  effectiveTdDesignation,
  tdUnitsForDesignation,
  type HistoricalTdContext,
} from "./td-designation";
import {
  programmeCareerFromAcademicCareer,
  type ProgrammeCareerRecord,
} from "@/lib/academic/programme-career";

export type RequisiteCompletionSnapshot = {
  completedCourses: CompletedRequisiteCourse[];
  /** Codes of the programmes on the viewer's primary plan. */
  enrolledProgrammeCodes: string[];
  programmeColleges?: ProgrammeCollege[];
  programmeCareers?: ProgrammeCareerRecord[];
  /** Majors, minors and specialisations on the viewer's primary plan. */
  enrolledStructureCodes?: string[];
  isAuthenticated: boolean;
};

type AttemptRow = {
  id: string;
  academic_period_id: number | null;
  catalogue_version_id: number;
  units_earned: number;
};

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
      .select("id,catalogue_version_id,academic_period_id,units_earned")
      .eq("owner_id", viewer.id)
      .eq("status", "completed");
    if (attemptsError) throw attemptsError;

    const attemptRows = (attempts ?? []) as AttemptRow[];
    const [projections, actualYearByAttemptId] = await Promise.all([
      loadOwnedAttemptProjections(
        attemptRows.map((attempt) => attempt.catalogue_version_id),
      ),
      loadAttemptCalendarYears(attemptRows),
    ]);
    const trustedCourses = projections.flatMap((row) => {
      const course = courseFromSnapshotProjection(
        row.projection,
        row.version_id,
      );
      return course ? [course] : [];
    });
    const courseByVersionId = new Map(
      trustedCourses.map((course) => [course.snapshotId, course]),
    );
    const historicalTd: HistoricalTdContext = {
      trustedSnapshotIds: trustedCourses.flatMap((course) =>
        course.snapshotId === undefined ? [] : [course.snapshotId],
      ),
      actualYearByAttemptId,
      designationByCourseYear: await loadPublishedTdDesignations(
        attemptRows.flatMap((attempt) => {
          const course = courseByVersionId.get(attempt.catalogue_version_id);
          const year = actualYearByAttemptId[attempt.id];
          return course && year !== undefined
            ? [{ code: course.code, year }]
            : [];
        }),
      ),
    };
    const programmeContext = await loadEnrolledProgrammeContext(
      supabase,
      viewer.id,
    );
    return {
      completedCourses: attemptRows.flatMap((attempt) => {
        const course = courseByVersionId.get(attempt.catalogue_version_id);
        const designation = course
          ? effectiveTdDesignation(
              {
                attemptId: attempt.id,
                code: course.code,
                status: "completed",
                snapshotId: course.snapshotId,
                snapshotYear: course.year,
                tags: course.tags,
              },
              historicalTd,
            )
          : undefined;
        return course && attempt.units_earned > 0
          ? [
              {
                code: course.code,
                units: attempt.units_earned,
                tags: course.tags,
                tdUnits: tdUnitsForDesignation(
                  attempt.units_earned,
                  designation,
                  course.tags,
                ),
              },
            ]
          : [];
      }),
      enrolledProgrammeCodes: programmeContext.codes,
      programmeColleges: programmeContext.colleges,
      programmeCareers: programmeContext.careers,
      enrolledStructureCodes: programmeContext.structureCodes,
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
async function loadEnrolledProgrammeContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
): Promise<{
  codes: string[];
  colleges: ProgrammeCollege[];
  careers: ProgrammeCareerRecord[];
  structureCodes: string[];
}> {
  const empty = { codes: [], colleges: [], careers: [], structureCodes: [] };
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_primary", true)
    .maybeSingle();
  if (planError || !plan) return empty;

  const { data: planStructures, error: planStructuresError } = await supabase
    .from("plan_structures")
    .select("catalogue_record_id,role")
    .eq("plan_id", plan.id);
  if (planStructuresError) return empty;
  const structureYearIds = (planStructures ?? []).map(
    (row) => row.catalogue_record_id,
  );
  if (structureYearIds.length === 0) return empty;

  const { data: allStructureYears, error: structureYearsError } = await supabase
    .from("catalogue_records")
    .select("code_id,published_version_id,archived_at,kind")
    .in("id", structureYearIds);
  if (structureYearsError) return empty;
  const structureYears = (allStructureYears ?? []).filter(
    (row) => row.kind === "programme",
  );
  const chosenIds = (allStructureYears ?? [])
    .filter((row) => row.kind !== "programme")
    .map((row) => row.code_id);
  const { data: chosenCodes, error: chosenCodesError } = chosenIds.length
    ? await supabase.from("catalogue_codes").select("code").in("id", chosenIds)
    : { data: [], error: null };
  const structureCodes = chosenCodesError
    ? []
    : (chosenCodes ?? []).map((row) => row.code.toUpperCase());
  const structureIds = [
    ...new Set(
      (structureYears ?? []).map((structureYear) => structureYear.code_id),
    ),
  ];
  if (structureIds.length === 0) return { ...empty, structureCodes };

  const { data: structures, error: structuresError } = await supabase
    .from("catalogue_codes")
    .select("id,code")
    .in("id", structureIds);
  if (structuresError) return empty;
  const versionIds = (structureYears ?? []).flatMap((row) =>
    row.published_version_id !== null && row.archived_at === null
      ? [row.published_version_id]
      : [],
  );
  const { data: details, error: detailsError } = versionIds.length
    ? await supabase
        .from("structure_version_details")
        .select("version_id,college,academic_career")
        .in("version_id", versionIds)
    : { data: [], error: null };
  const detailRows = detailsError ? [] : (details ?? []);
  const collegeByVersion = new Map(
    detailRows.map((row) => [row.version_id, row.college]),
  );
  const careerByVersion = new Map(
    detailRows.map((row) => [
      row.version_id,
      programmeCareerFromAcademicCareer(row.academic_career),
    ]),
  );
  const codeById = new Map(
    (structures ?? []).map((row) => [row.id, row.code.toUpperCase()]),
  );
  const isPublished = (row: (typeof structureYears)[number]) =>
    row.archived_at === null && row.published_version_id !== null;
  return {
    structureCodes,
    careers: structureYears.flatMap((row) => {
      const code = codeById.get(row.code_id);
      return code
        ? [
            {
              code,
              career: isPublished(row)
                ? (careerByVersion.get(row.published_version_id!) ?? null)
                : null,
            },
          ]
        : [];
    }),
    codes: [...codeById.values()],
    colleges: (structureYears ?? []).flatMap((row) => {
      const code = codeById.get(row.code_id);
      return code
        ? [
            {
              code,
              college:
                row.archived_at === null && row.published_version_id !== null
                  ? (collegeByVersion.get(row.published_version_id) ?? null)
                  : null,
            },
          ]
        : [];
    }),
  };
}
