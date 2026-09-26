import "server-only";
import type { Database } from "@/types/database";
import type { Course, Degree, Major, Term } from "@/lib/coursemap/types";
import { createPublicClient } from "@/lib/supabase/public-server";
import {
  courseFromSnapshotProjection,
  loadPublishedCoursesBySelections,
} from "@/lib/coursemap/published-courses";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { getAuthViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { collectPlanCatalogueRecordIds } from "@/lib/coursemap/plan-course-ids";

export type PlanCatalogue = {
  academicYear: number | null;
  courses: Course[];
  /** Snapshot-pinned course rows used only by recorded attempts. */
  snapshotCourses?: Course[];
  terms: Term[];
  degrees: Degree[];
  majors: Major[];
  structures: PlanStructureSummary[];
  programmeRequirementsImported: boolean;
  structureRequirements: PlanStructureRequirements[];
};

export type PlanRequirementOption = {
  code: string;
  kind: string;
  position: number;
  structureKind: string | null;
};

export type PlanRequirementCondition = {
  type: "condition";
  conditionKind: string;
  freeText: string | null;
  id: number;
  maximumLevel: number | null;
  maximumUnits: number | null;
  minimumCourses: number | null;
  minimumLevel: number | null;
  minimumUnits: number | null;
  options: PlanRequirementOption[];
  position: number;
  projectionKey: string;
  sourceLocator: string;
  sourceText: string;
  structureKind: string | null;
  subjectCode: string | null;
  tag: string | null;
};

export type PlanRequirementGroup = {
  type: "group";
  children: PlanRequirementNode[];
  description: string | null;
  groupKey: string;
  id: number;
  maximumUnits: number | null;
  minimumCount: number | null;
  minimumUnits: number | null;
  operator: string;
  position: number;
  sourceLocator: string;
  sourceText: string;
  title: string | null;
};

export type PlanRequirementNode =
  PlanRequirementGroup | PlanRequirementCondition;

export type PlanStructureRequirements = {
  root: PlanRequirementGroup | null;
  snapshotId: number;
  structureCode: string;
  structureKind: PlanStructureKind;
  structureName: string;
  unmodelled: Array<{
    position: number;
    sourceLocator: string | null;
    sourceText: string;
  }>;
};

export type PlanStructureKind =
  "programme" | "major" | "minor" | "specialisation";

export type PlanStructureSummary = {
  code: string;
  kind: PlanStructureKind;
  name: string;
};

type AcademicPeriodRow = {
  calendar_year: number;
  code: string;
  ends_on: string;
  name: string;
  short_name: string;
  starts_on: string;
};
type StructureSnapshotRow = {
  college: string | null;
  description: string | null;
  duration_years: number | null;
  version_id: number;
  name: string;
  units: number | null;
};
type StructureIdentityRow = { code: string; id: number; kind: string };
type RequirementGroupRow =
  Database["public"]["Tables"]["requirement_groups"]["Row"];
type RequirementConditionRow =
  Database["public"]["Tables"]["requirement_conditions"]["Row"];
type RequirementOptionRow =
  Database["public"]["Tables"]["requirement_condition_options"]["Row"];
type PlanCourseRow = { catalogue_record_id: number };
type PlanStructureRow = { catalogue_record_id: number };
type AttemptCourseRow = { catalogue_version_id: number };
type AttemptVersionRow = {
  id: number;
  record_id: number;
};
type CatalogueRecordRow = {
  academic_year_id: number;
  code_id: number;
  id: number;
};

export function isPlanStructureKind(value: string): value is PlanStructureKind {
  return ["programme", "major", "minor", "specialisation"].includes(value);
}

function formatDateRange(startsOn: string, endsOn: string) {
  const format = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${format.format(new Date(startsOn))} to ${format.format(new Date(endsOn))}`;
}

export function planCourseFromDetails(course: CourseDetails): Course {
  return {
    code: course.code,
    name: course.name,
    year: course.year,
    snapshotId: course.snapshotId,
    units: course.units,
    unitValue: course.unitValue,
    level: course.level,
    subject: course.subject,
    school: course.school,
    convener: course.convener,
    sessions: course.sessions,
    delivery: course.delivery,
    description: course.description,
    prerequisiteText: course.prerequisiteText,
    prerequisiteCodes: course.prerequisiteCodes,
    prerequisiteRule: course.prerequisiteRule,
    incompatibilities: course.incompatibilityText
      ? [course.incompatibilityText]
      : [],
    // Requirement allocation and permission rules are intentionally omitted
    // until their source structures have been imported and reviewed.
    countsTowards: [],
    sourceUrl: course.sourceUrl,
    lastChanged: course.sourceUpdatedAt ?? "Not listed",
    parseState:
      course.reviewState === "verified"
        ? "Verified"
        : course.reviewState === "review"
          ? "Review"
          : "Automatic",
    accent: course.accent,
  };
}

export function buildAcademicStructureRequirementTree({
  groups,
  conditions,
  options,
}: {
  groups: RequirementGroupRow[];
  conditions: RequirementConditionRow[];
  options: RequirementOptionRow[];
}): PlanRequirementGroup | null {
  const root = groups.find((group) => group.parent_group_id === null);
  if (!root) return null;

  const childGroupsByParent = new Map<number, RequirementGroupRow[]>();
  for (const group of groups) {
    if (group.parent_group_id === null) continue;
    const siblings = childGroupsByParent.get(group.parent_group_id) ?? [];
    siblings.push(group);
    childGroupsByParent.set(group.parent_group_id, siblings);
  }
  const conditionsByGroup = new Map<number, RequirementConditionRow[]>();
  for (const condition of conditions) {
    const siblings = conditionsByGroup.get(condition.group_id) ?? [];
    siblings.push(condition);
    conditionsByGroup.set(condition.group_id, siblings);
  }
  const optionsByCondition = new Map<number, RequirementOptionRow[]>();
  for (const option of options) {
    const siblings = optionsByCondition.get(option.condition_id) ?? [];
    siblings.push(option);
    optionsByCondition.set(option.condition_id, siblings);
  }

  function conditionNode(
    condition: RequirementConditionRow,
  ): PlanRequirementCondition {
    return {
      type: "condition",
      conditionKind: condition.condition_kind,
      freeText: condition.free_text,
      id: condition.id,
      maximumLevel: condition.maximum_level,
      maximumUnits: condition.maximum_units,
      minimumCourses: condition.minimum_count,
      minimumLevel: condition.minimum_level,
      minimumUnits: condition.minimum_units,
      options: (optionsByCondition.get(condition.id) ?? [])
        .toSorted((left, right) => left.position - right.position)
        .map((option) => ({
          code: option.code,
          kind: option.kind === "course" ? "course" : "structure",
          position: option.position,
          structureKind: option.kind === "course" ? null : option.kind,
        })),
      position: condition.position,
      projectionKey: condition.condition_key,
      sourceLocator: condition.source_locator ?? "",
      sourceText: condition.source_text ?? "",
      structureKind: condition.structure_kind,
      subjectCode: condition.subject_code,
      tag: condition.tag,
    };
  }

  function groupNode(
    group: RequirementGroupRow,
    ancestors: ReadonlySet<number>,
  ): PlanRequirementGroup {
    const nextAncestors = new Set(ancestors).add(group.id);
    const childGroups = (childGroupsByParent.get(group.id) ?? [])
      .filter((child) => !nextAncestors.has(child.id))
      .map((child) => groupNode(child, nextAncestors));
    const childConditions = (conditionsByGroup.get(group.id) ?? []).map(
      conditionNode,
    );
    return {
      type: "group",
      children: [...childGroups, ...childConditions].toSorted(
        (left, right) => left.position - right.position,
      ),
      description: group.description,
      groupKey: group.group_key,
      id: group.id,
      maximumUnits: group.maximum_units,
      minimumCount: group.minimum_count,
      minimumUnits: group.minimum_units,
      operator: group.operator,
      position: group.position,
      sourceLocator: group.source_locator ?? "",
      sourceText: group.source_text ?? "",
      title: group.label,
    };
  }

  return groupNode(root, new Set());
}

async function loadAcademicYearRecord(
  supabase: ReturnType<typeof createPublicClient>,
  catalogueYear?: number,
) {
  if (catalogueYear) {
    const result = await supabase
      .from("academic_years")
      .select("id,year")
      .eq("year", catalogueYear)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }

  const programmeYearsResult = await supabase
    .from("catalogue_records")
    .select("academic_year_id")
    .eq("kind", "programme")
    .is("archived_at", null)
    .not("published_version_id", "is", null);
  if (programmeYearsResult.error) throw programmeYearsResult.error;
  const academicYearIds = [
    ...new Set(
      (programmeYearsResult.data ?? []).map((row) => row.academic_year_id),
    ),
  ];
  if (academicYearIds.length === 0) return null;

  const latestYearResult = await supabase
    .from("academic_years")
    .select("id,year")
    .in("id", academicYearIds)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestYearResult.error) throw latestYearResult.error;
  return latestYearResult.data;
}

export async function loadPublishedPlanCatalogue(
  catalogueYear?: number,
  courseSelections: readonly { code: string; year: number }[] = [],
  selectedStructureYearIds: readonly number[] = [],
): Promise<PlanCatalogue> {
  const supabase = createPublicClient();
  const academicYearRecord = await loadAcademicYearRecord(
    supabase,
    catalogueYear,
  );
  if (!academicYearRecord) {
    return {
      academicYear: null,
      courses: [],
      terms: [],
      degrees: [],
      majors: [],
      structures: [],
      programmeRequirementsImported: false,
      structureRequirements: [],
    };
  }
  const [catalogueCourses, periodsResult, structureYearsResult] =
    await Promise.all([
      loadPublishedCoursesBySelections(courseSelections),
      supabase
        .from("academic_periods")
        .select("calendar_year,code,ends_on,name,short_name,starts_on")
        .eq("calendar_year", academicYearRecord.year)
        .eq("status", "published")
        .order("calendar_year")
        .order("sort_order"),
      supabase
        .from("catalogue_records")
        .select("id,published_version_id,code_id")
        .eq("academic_year_id", academicYearRecord.id)
        .neq("kind", "course")
        .is("archived_at", null)
        .not("published_version_id", "is", null),
    ]);
  if (periodsResult.error) throw periodsResult.error;
  if (structureYearsResult.error) throw structureYearsResult.error;

  const structureYears = (structureYearsResult.data ?? []).filter(
    (
      row,
    ): row is typeof row & {
      published_version_id: number;
    } => row.published_version_id !== null,
  );
  const structureIds = [
    ...new Set(structureYears.map((structureYear) => structureYear.code_id)),
  ];
  const snapshotIds = structureYears.map(
    (structureYear) => structureYear.published_version_id,
  );
  const [structureIdentitiesResult, structureSnapshotsResult] =
    await Promise.all([
      structureIds.length
        ? supabase
            .from("catalogue_codes")
            .select("code,id,kind")
            .in("id", structureIds)
        : Promise.resolve({ data: [], error: null }),
      snapshotIds.length
        ? supabase
            .from("structure_version_details")
            .select("college,description,duration_years,version_id,name,units")
            .in("version_id", snapshotIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const structureError = [
    structureIdentitiesResult.error,
    structureSnapshotsResult.error,
  ].find(Boolean);
  if (structureError) throw structureError;

  const identitiesById = new Map(
    ((structureIdentitiesResult.data ?? []) as StructureIdentityRow[]).map(
      (identity) => [identity.id, identity],
    ),
  );
  const snapshotsById = new Map(
    ((structureSnapshotsResult.data ?? []) as StructureSnapshotRow[]).map(
      (snapshot) => [snapshot.version_id, snapshot],
    ),
  );

  const selectedStructureYears = new Set(
    selectedStructureYearIds.filter(
      (structureYearId) =>
        Number.isInteger(structureYearId) && structureYearId > 0,
    ),
  );
  const requirementsSnapshotIds = structureYears.flatMap((structureYear) => {
    const kind = identitiesById.get(structureYear.code_id)?.kind;
    return selectedStructureYears.has(structureYear.id) &&
      kind !== undefined &&
      isPlanStructureKind(kind)
      ? [structureYear.published_version_id]
      : [];
  });
  const requirementsSnapshotIdSet = new Set(requirementsSnapshotIds);
  const [groupsResult, conditionsResult, optionsResult] = await Promise.all([
    requirementsSnapshotIds.length
      ? supabase
          .from("requirement_groups")
          .select("*")
          .in("version_id", requirementsSnapshotIds)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    requirementsSnapshotIds.length
      ? supabase
          .from("requirement_conditions")
          .select("*")
          .in("version_id", requirementsSnapshotIds)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    requirementsSnapshotIds.length
      ? supabase
          .from("requirement_condition_options")
          .select("*")
          .in("version_id", requirementsSnapshotIds)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const requirementsError = [
    groupsResult.error,
    conditionsResult.error,
    optionsResult.error,
  ].find(Boolean);
  if (requirementsError) throw requirementsError;

  const requirementGroups = (groupsResult.data ?? []) as RequirementGroupRow[];
  const requirementConditions = (conditionsResult.data ??
    []) as RequirementConditionRow[];
  const requirementOptions = (optionsResult.data ??
    []) as RequirementOptionRow[];
  const courseCodesBySnapshotId = new Map<number, Set<string>>();
  for (const option of requirementOptions) {
    if (option.kind !== "course") continue;
    const codes =
      courseCodesBySnapshotId.get(option.version_id) ?? new Set<string>();
    codes.add(option.code);
    courseCodesBySnapshotId.set(option.version_id, codes);
  }
  const degrees = structureYears.flatMap((structureYear) => {
    const identity = identitiesById.get(structureYear.code_id);
    const snapshot = snapshotsById.get(structureYear.published_version_id);
    if (!identity || !snapshot || identity.kind !== "programme") return [];
    return [
      {
        code: identity.code,
        name: snapshot.name,
        units: snapshot.units === null ? null : Number(snapshot.units),
        duration:
          snapshot.duration_years === null
            ? null
            : Number(snapshot.duration_years),
        college: snapshot.college ?? "Not listed",
        description: snapshot.description ?? "",
      } satisfies Degree,
    ];
  });
  const structures = structureYears.flatMap((structureYear) => {
    const identity = identitiesById.get(structureYear.code_id);
    const snapshot = snapshotsById.get(structureYear.published_version_id);
    if (!identity || !snapshot || !isPlanStructureKind(identity.kind))
      return [];
    return [
      {
        code: identity.code,
        kind: identity.kind,
        name: snapshot.name,
      } satisfies PlanStructureSummary,
    ];
  });
  const structureRequirements = structureYears.flatMap((structureYear) => {
    const identity = identitiesById.get(structureYear.code_id);
    const snapshot = snapshotsById.get(structureYear.published_version_id);
    if (
      !identity ||
      !snapshot ||
      !requirementsSnapshotIdSet.has(structureYear.published_version_id) ||
      !isPlanStructureKind(identity.kind)
    ) {
      return [];
    }
    const snapshotId = structureYear.published_version_id;
    return [
      {
        root: buildAcademicStructureRequirementTree({
          groups: requirementGroups.filter(
            (group) => group.version_id === snapshotId,
          ),
          conditions: requirementConditions.filter(
            (condition) => condition.version_id === snapshotId,
          ),
          options: requirementOptions.filter(
            (option) => option.version_id === snapshotId,
          ),
        }),
        snapshotId,
        structureCode: identity.code,
        structureKind: identity.kind,
        structureName: snapshot.name,
        // Source wording the importer could not model is kept as `other`
        // conditions so students still see it.
        unmodelled: requirementConditions
          .filter(
            (condition) =>
              condition.version_id === snapshotId &&
              condition.condition_kind === "other" &&
              condition.free_text !== null,
          )
          .map((condition) => ({
            position: condition.position,
            sourceLocator: condition.source_locator,
            sourceText: condition.free_text ?? "",
          })),
      } satisfies PlanStructureRequirements,
    ];
  });
  const majors = structureYears.flatMap((structureYear) => {
    const identity = identitiesById.get(structureYear.code_id);
    const snapshot = snapshotsById.get(structureYear.published_version_id);
    if (!identity || !snapshot || identity.kind !== "major") return [];
    return [
      {
        code: identity.code,
        name: snapshot.name,
        units: snapshot.units === null ? null : Number(snapshot.units),
        colour: "zinc",
        description: snapshot.description ?? "",
        courseCodes: [
          ...(courseCodesBySnapshotId.get(structureYear.published_version_id) ??
            []),
        ].sort(),
      } satisfies Major,
    ];
  });

  const terms: Term[] = ((periodsResult.data ?? []) as AcademicPeriodRow[]).map(
    (period) => ({
      id: `${period.calendar_year}-${period.code.toLowerCase()}`,
      year: period.calendar_year,
      name: period.name,
      shortName: period.short_name,
      dates: formatDateRange(period.starts_on, period.ends_on),
      startsOn: period.starts_on,
      endsOn: period.ends_on,
    }),
  );
  terms.push({
    id: "unscheduled",
    year: 9999,
    name: "Later",
    shortName: "Later",
    dates: "Choose when ready",
  });

  return {
    academicYear: academicYearRecord.year,
    courses: catalogueCourses.map(planCourseFromDetails),
    terms,
    degrees,
    majors,
    structures,
    programmeRequirementsImported: structureRequirements.some(
      (requirement) =>
        requirement.structureKind === "programme" &&
        (requirement.root !== null || requirement.unmodelled.length > 0),
    ),
    structureRequirements,
  };
}

/** Loads the academic rules year saved on the signed-in user's primary plan. */
export async function loadCurrentUserPlanCatalogue(): Promise<PlanCatalogue> {
  const viewer = await getAuthViewer();
  if (!viewer) return loadPublishedPlanCatalogue();

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .select("academic_year_id,id")
    .eq("owner_id", viewer.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (error || !plan) return loadPublishedPlanCatalogue();

  const { data: year, error: yearError } = await supabase
    .from("academic_years")
    .select("year")
    .eq("id", plan.academic_year_id)
    .maybeSingle();
  if (yearError || !year) return loadPublishedPlanCatalogue();

  const [itemsResult, attemptsResult, structuresResult] = await Promise.all([
    supabase
      .from("plan_items")
      .select("catalogue_record_id")
      .eq("plan_id", plan.id),
    supabase
      .from("course_attempts")
      .select("catalogue_version_id")
      .eq("owner_id", viewer.id),
    supabase
      .from("plan_structures")
      .select("catalogue_record_id")
      .eq("plan_id", plan.id),
  ]);
  if (itemsResult.error || attemptsResult.error || structuresResult.error) {
    return loadPublishedPlanCatalogue(year.year);
  }
  // These columns are introduced by the clean snapshot cutover migration.
  // Keep the row contract local while generated database types are refreshed.
  const planItems = (itemsResult.data ?? []) as unknown as PlanCourseRow[];
  const courseAttempts = (attemptsResult.data ??
    []) as unknown as AttemptCourseRow[];
  const planStructures = (structuresResult.data ??
    []) as unknown as PlanStructureRow[];
  const versionIds = [
    ...new Set(courseAttempts.map((attempt) => attempt.catalogue_version_id)),
  ];
  const versionsResult = versionIds.length
    ? await supabase
        .from("catalogue_versions")
        .select("id,record_id")
        .in("id", versionIds)
    : { data: [], error: null };
  if (versionsResult.error) {
    return loadPublishedPlanCatalogue(year.year);
  }
  const attemptVersions = (versionsResult.data ?? []) as AttemptVersionRow[];
  const recordIds = collectPlanCatalogueRecordIds(
    planItems,
    attemptVersions.map((version) => ({
      catalogue_record_id: version.record_id,
    })),
  );
  const recordsResult = recordIds.length
    ? await supabase
        .from("catalogue_records")
        .select("id,code_id,academic_year_id")
        .in("id", recordIds)
    : { data: [], error: null };
  if (recordsResult.error) return loadPublishedPlanCatalogue(year.year);
  const records = (recordsResult.data ?? []) as CatalogueRecordRow[];
  const courseIds = [...new Set(records.map((record) => record.code_id))];
  const allAcademicYearIds = [
    ...new Set(records.map((record) => record.academic_year_id)),
  ];
  const coursesResult = courseIds.length
    ? await supabase
        .from("catalogue_codes")
        .select("id,code")
        .in("id", courseIds)
    : { data: [], error: null };
  const academicYearsResult = allAcademicYearIds.length
    ? await supabase
        .from("academic_years")
        .select("id,year")
        .in("id", allAcademicYearIds)
    : { data: [], error: null };
  if (coursesResult.error || academicYearsResult.error) {
    return loadPublishedPlanCatalogue(year.year);
  }
  const codeByCourseId = new Map(
    (coursesResult.data ?? []).map((course) => [course.id, course.code]),
  );
  const yearByAcademicYearId = new Map(
    (academicYearsResult.data ?? []).map((academicYear) => [
      academicYear.id,
      academicYear.year,
    ]),
  );
  const recordById = new Map(records.map((record) => [record.id, record]));
  const recordIdByVersionId = new Map(
    attemptVersions.map((version) => [version.id, version.record_id]),
  );
  const selections = [
    ...planItems.flatMap((item) => {
      const record = recordById.get(item.catalogue_record_id);
      const code = record ? codeByCourseId.get(record.code_id) : undefined;
      const academicYear = record
        ? yearByAcademicYearId.get(record.academic_year_id)
        : undefined;
      return code && academicYear ? [{ code, year: academicYear }] : [];
    }),
    ...courseAttempts.flatMap((attempt) => {
      const record = recordById.get(
        recordIdByVersionId.get(attempt.catalogue_version_id) ?? -1,
      );
      const code = record ? codeByCourseId.get(record.code_id) : undefined;
      const academicYear = record
        ? yearByAcademicYearId.get(record.academic_year_id)
        : undefined;
      return code && academicYear ? [{ code, year: academicYear }] : [];
    }),
  ];
  const catalogue = await loadPublishedPlanCatalogue(
    year.year,
    selections,
    planStructures.map((structure) => structure.catalogue_record_id),
  );
  const publishedVersionIds = new Set(
    catalogue.courses.flatMap((course) =>
      course.snapshotId === undefined ? [] : [course.snapshotId],
    ),
  );
  const historicalSnapshotIds = versionIds.filter(
    (snapshotId) => !publishedVersionIds.has(snapshotId),
  );
  const projectionsResult = historicalSnapshotIds.length
    ? await supabase.rpc("current_user_course_attempt_version_projections", {
        p_version_ids: historicalSnapshotIds,
      })
    : { data: [], error: null };
  if (projectionsResult.error) return catalogue;

  const snapshotCourses = (projectionsResult.data ?? []).flatMap((row) => {
    const course = courseFromSnapshotProjection(row.projection, row.version_id);
    return course ? [planCourseFromDetails(course)] : [];
  });
  return { ...catalogue, snapshotCourses };
}
