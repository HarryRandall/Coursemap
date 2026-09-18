import "server-only";

import {
  collectSelectableStructureCodes,
  emptySelectableStructureCodes,
  type ProgrammeStructureRelationship,
  type ProgrammeStructureRequirementCondition,
  type ProgrammeStructureRequirementOption,
  type SelectableStructureKind,
} from "@/lib/coursemap/programme-structure-options";
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
 * Student choices come only from explicitly published immutable snapshots.
 * The legacy `degrees` property is retained at the component boundary while
 * the database and import vocabulary consistently use `programme`.
 */
export async function loadOnboardingCatalogue(): Promise<OnboardingCatalogue> {
  const supabase = createPublicClient();
  const { data: structureYears, error: structureYearsError } = await supabase
    .from("catalogue_item_years")
    .select("academic_year_id,published_snapshot_id,item_id")
    .neq("kind", "course")
    .is("archived_at", null)
    .not("published_snapshot_id", "is", null);
  if (structureYearsError) throw structureYearsError;

  const publishedYears = (structureYears ?? []).filter(
    (
      row,
    ): row is typeof row & {
      published_snapshot_id: number;
    } => row.published_snapshot_id !== null,
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
  const structureIds = [...new Set(publishedYears.map((row) => row.item_id))];
  const snapshotIds = publishedYears.map((row) => row.published_snapshot_id);
  const [
    yearsResult,
    structuresResult,
    snapshotsResult,
    relationshipsResult,
    requirementConditionsResult,
    requirementOptionsResult,
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,year")
      .in("id", academicYearIds)
      .order("year", { ascending: false }),
    supabase
      .from("catalogue_items")
      .select("code,id,kind")
      .in("id", structureIds),
    supabase
      .from("structure_snapshot_details")
      .select("description,duration_years,snapshot_id,name,units")
      .in("snapshot_id", snapshotIds),
    supabase
      .from("academic_structure_snapshot_relationships")
      .select("relationship_kind,snapshot_id,target_code,target_kind")
      .in("snapshot_id", snapshotIds),
    supabase
      .from("requirement_conditions")
      .select("condition_kind,id,snapshot_id,structure_kind")
      .in("snapshot_id", snapshotIds)
      .eq("condition_kind", "structure_set"),
    supabase
      .from("requirement_condition_options")
      .select("code,condition_id,kind,snapshot_id")
      .in("snapshot_id", snapshotIds)
      .neq("kind", "course"),
  ]);
  const error = [
    yearsResult.error,
    structuresResult.error,
    snapshotsResult.error,
    relationshipsResult.error,
    requirementConditionsResult.error,
    requirementOptionsResult.error,
  ].find(Boolean);
  if (error) throw error;

  const yearById = new Map(
    (yearsResult.data ?? []).map((year) => [year.id, year.year]),
  );
  const structureById = new Map(
    (structuresResult.data ?? []).map((structure) => [structure.id, structure]),
  );
  const publishedYearBySnapshotId = new Map(
    publishedYears.map((row) => [row.published_snapshot_id, row]),
  );
  const programmeSnapshotIds = new Set(
    publishedYears.flatMap((row) => {
      const identity = structureById.get(row.item_id);
      return identity?.kind === "programme" ? [row.published_snapshot_id] : [];
    }),
  );
  const structureCodesByProgrammeSnapshot = collectSelectableStructureCodes({
    programmeSnapshotIds,
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
    (snapshotsResult.data ?? [])
      .flatMap((snapshot) => {
        const structureYear = publishedYearBySnapshotId.get(
          snapshot.snapshot_id,
        );
        const identity = structureYear
          ? structureById.get(structureYear.item_id)
          : null;
        const academicYear = structureYear
          ? yearById.get(structureYear.academic_year_id)
          : null;
        if (!identity || !academicYear || identity.kind !== kind) return [];
        const selectableCodes =
          kind === "programme"
            ? (structureCodesByProgrammeSnapshot.get(snapshot.snapshot_id) ??
              emptySelectableStructureCodes())
            : emptySelectableStructureCodes();
        return [
          {
            catalogueYear: academicYear,
            code: identity.code,
            description: snapshot.description ?? "",
            durationYears:
              snapshot.duration_years === null
                ? null
                : Number(snapshot.duration_years),
            majorCodes: selectableCodes.major,
            minorCodes: selectableCodes.minor,
            name: snapshot.name,
            specialisationCodes: selectableCodes.specialisation,
            units: snapshot.units === null ? null : Number(snapshot.units),
          } satisfies ProgrammeOption,
        ];
      })
      .sort((left, right) => left.name.localeCompare(right.name));

  const programmeYearIds = new Set(
    publishedYears.flatMap((row) => {
      const identity = structureById.get(row.item_id);
      return identity?.kind === "programme" ? [row.academic_year_id] : [];
    }),
  );

  return {
    catalogueYears: (yearsResult.data ?? []).filter((year) =>
      programmeYearIds.has(year.id),
    ),
    degrees: options("programme"),
    majors: options("major"),
    minors: options("minor"),
    specialisations: options("specialisation"),
  };
}
