import "server-only";

import {
  collectSelectableStructureCodes,
  emptySelectableStructureCodes,
  type ProgrammeStructureRelationship,
  type ProgrammeStructureRequirementCondition,
  type ProgrammeStructureRequirementOption,
  type SelectableStructureKind,
} from "@/lib/coursemap/programme-structure-options";
import { readAllRows, readRowsForIds } from "@/lib/supabase/read-all-rows";
import { createPublicClient } from "@/lib/supabase/public-server";

export type CatalogueYearOption = {
  id: number;
  year: number;
};

export type ProgrammeOption = {
  catalogueYear: number;
  code: string;
  description: string;
  durationYears: number | null;
  majorCodes: string[];
  minorCodes: string[];
  name: string;
  specialisationCodes: string[];
  units: number | null;
};

export type OnboardingCatalogue = {
  catalogueYears: CatalogueYearOption[];
  degrees: ProgrammeOption[];
  majors: ProgrammeOption[];
  minors: ProgrammeOption[];
  specialisations: ProgrammeOption[];
};

/**
 * Student choices come only from published versions. Students call a
 * programme a degree, so the component boundary keeps `degrees`.
 */
export async function loadOnboardingCatalogue(): Promise<OnboardingCatalogue> {
  const supabase = createPublicClient();
  const { data: structureYears, error: structureYearsError } =
    await readAllRows((from, to) =>
      supabase
        .from("catalogue_records")
        .select("id,academic_year_id,published_version_id,code_id")
        .neq("kind", "course")
        .is("archived_at", null)
        .not("published_version_id", "is", null)
        .order("id")
        .range(from, to),
    );
  if (structureYearsError) throw structureYearsError;

  const publishedYears = (structureYears ?? []).filter(
    (
      row,
    ): row is typeof row & {
      published_version_id: number;
    } => row.published_version_id !== null,
  );
  if (publishedYears.length === 0) {
    return {
      catalogueYears: [],
      degrees: [],
      majors: [],
      minors: [],
      specialisations: [],
    };
  }

  const academicYearIds = [
    ...new Set(publishedYears.map((row) => row.academic_year_id)),
  ];
  const structureIds = [...new Set(publishedYears.map((row) => row.code_id))];
  const versionIds = publishedYears.map((row) => row.published_version_id);
  const [
    yearsResult,
    structuresResult,
    versionsResult,
    relationshipsResult,
    requirementConditionsResult,
    requirementOptionsResult,
    electiveConditionsResult,
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,year")
      .in("id", academicYearIds)
      .order("year", { ascending: false }),
    readRowsForIds(structureIds, (batch, from, to) =>
      supabase
        .from("catalogue_codes")
        .select("code,id,kind")
        .in("id", batch)
        .order("id")
        .range(from, to),
    ),
    readRowsForIds(versionIds, (batch, from, to) =>
      supabase
        .from("structure_version_details")
        .select("description,duration_years,version_id,name,units")
        .in("version_id", batch)
        .order("version_id")
        .range(from, to),
    ),
    readRowsForIds(versionIds, (batch, from, to) =>
      supabase
        .from("academic_structure_snapshot_relationships")
        .select("relationship_kind,version_id,target_code,target_kind")
        .in("version_id", batch)
        .order("version_id")
        .order("relationship_kind")
        .order("target_kind")
        .order("target_code")
        .range(from, to),
    ),
    readRowsForIds(versionIds, (batch, from, to) =>
      supabase
        .from("requirement_conditions")
        .select("condition_kind,id,version_id,structure_kind")
        .in("version_id", batch)
        .eq("condition_kind", "structure_set")
        .order("id")
        .range(from, to),
    ),
    readRowsForIds(versionIds, (batch, from, to) =>
      supabase
        .from("requirement_condition_options")
        .select("code,condition_id,kind,version_id")
        .in("version_id", batch)
        .neq("kind", "course")
        .order("condition_id")
        .order("kind")
        .order("code")
        .range(from, to),
    ),
    readRowsForIds(versionIds, (batch, from, to) =>
      supabase
        .from("requirement_conditions")
        .select("id,version_id")
        .in("version_id", batch)
        .eq("condition_kind", "elective_units")
        .order("id")
        .range(from, to),
    ),
  ]);
  const error = [
    yearsResult.error,
    structuresResult.error,
    versionsResult.error,
    relationshipsResult.error,
    requirementConditionsResult.error,
    requirementOptionsResult.error,
    electiveConditionsResult.error,
  ].find(Boolean);
  if (error) throw error;

  const yearById = new Map(
    (yearsResult.data ?? []).map((year) => [year.id, year.year]),
  );
  const structureById = new Map(
    (structuresResult.data ?? []).map((structure) => [structure.id, structure]),
  );
  const publishedYearByVersionId = new Map(
    publishedYears.map((row) => [row.published_version_id, row]),
  );
  const programmeVersionIds = new Set(
    publishedYears.flatMap((row) => {
      const identity = structureById.get(row.code_id);
      return identity?.kind === "programme" ? [row.published_version_id] : [];
    }),
  );
  const structureCodesByProgrammeVersion = collectSelectableStructureCodes({
    programmeVersionIds,
    relationships: (relationshipsResult.data ??
      []) as ProgrammeStructureRelationship[],
    requirementConditions: (requirementConditionsResult.data ??
      []) as ProgrammeStructureRequirementCondition[],
    requirementOptions: (requirementOptionsResult.data ??
      []) as ProgrammeStructureRequirementOption[],
  });

  const options = (
    kind: "programme" | SelectableStructureKind,
  ): ProgrammeOption[] =>
    (versionsResult.data ?? [])
      .flatMap((version) => {
        const structureYear = publishedYearByVersionId.get(version.version_id);
        const identity = structureYear
          ? structureById.get(structureYear.code_id)
          : null;
        const academicYear = structureYear
          ? yearById.get(structureYear.academic_year_id)
          : null;
        if (!identity || !academicYear || identity.kind !== kind) return [];
        const selectableCodes =
          kind === "programme"
            ? (structureCodesByProgrammeVersion.get(version.version_id) ??
              emptySelectableStructureCodes())
            : emptySelectableStructureCodes();
        return [
          {
            catalogueYear: academicYear,
            code: identity.code,
            description: version.description ?? "",
            durationYears:
              version.duration_years === null
                ? null
                : Number(version.duration_years),
            majorCodes: selectableCodes.major,
            minorCodes: selectableCodes.minor,
            name: version.name,
            specialisationCodes: selectableCodes.specialisation,
            units: version.units === null ? null : Number(version.units),
          } satisfies ProgrammeOption,
        ];
      })
      .sort((left, right) => left.name.localeCompare(right.name));

  const programmeYearIds = new Set(
    publishedYears.flatMap((row) => {
      const identity = structureById.get(row.code_id);
      return identity?.kind === "programme" ? [row.academic_year_id] : [];
    }),
  );

  // A degree with elective units lets a student take any minor through them,
  // though its rules name few or none. Such degrees offer every published
  // minor for the year, the ones their rules name first. Specialisations stay
  // limited to those named, since each belongs with a particular major.
  const electiveVersionIds = new Set(
    (electiveConditionsResult.data ?? []).map((row) => row.version_id),
  );
  const programmeKeysWithElectives = new Set(
    (versionsResult.data ?? []).flatMap((version) => {
      const structureYear = publishedYearByVersionId.get(version.version_id);
      const identity = structureYear
        ? structureById.get(structureYear.code_id)
        : null;
      const academicYear = structureYear
        ? yearById.get(structureYear.academic_year_id)
        : null;
      return identity?.kind === "programme" &&
        academicYear &&
        electiveVersionIds.has(version.version_id)
        ? [`${identity.code}:${academicYear}`]
        : [];
    }),
  );
  const minors = options("minor");
  const degrees = options("programme").map((degree) =>
    programmeKeysWithElectives.has(`${degree.code}:${degree.catalogueYear}`)
      ? {
          ...degree,
          minorCodes: [
            ...new Set([
              ...degree.minorCodes,
              ...minors
                .filter((minor) => minor.catalogueYear === degree.catalogueYear)
                .map((minor) => minor.code),
            ]),
          ],
        }
      : degree,
  );

  return {
    catalogueYears: (yearsResult.data ?? []).filter((year) =>
      programmeYearIds.has(year.id),
    ),
    degrees,
    majors: options("major"),
    minors,
    specialisations: options("specialisation"),
  };
}
