export const SELECTABLE_STRUCTURE_KINDS = [
  "major",
  "minor",
  "specialisation",
] as const;

export type SelectableStructureKind =
  (typeof SELECTABLE_STRUCTURE_KINDS)[number];

export type ProgrammeStructureRelationship = {
  relationship_kind: string;
  snapshot_id: number;
  target_code: string;
  target_kind: string;
};

export type ProgrammeStructureRequirementCondition = {
  condition_kind: string;
  id: number;
  snapshot_id: number;
  structure_kind: string | null;
};

export type ProgrammeStructureRequirementOption = {
  code: string;
  condition_id: number;
  kind: string;
  snapshot_id: number;
};

export type SelectableStructureCodes = Record<
  SelectableStructureKind,
  string[]
>;

export function emptySelectableStructureCodes(): SelectableStructureCodes {
  return { major: [], minor: [], specialisation: [] };
}

function isSelectableStructureKind(
  value: string | null,
): value is SelectableStructureKind {
  return SELECTABLE_STRUCTURE_KINDS.some((kind) => kind === value);
}

/**
 * Returns only structures which published programme rules explicitly make
 * selectable. Incidental source references and incompatibilities must never
 * become student choices.
 */
export function collectSelectableStructureCodes({
  programmeSnapshotIds,
  relationships,
  requirementConditions,
  requirementOptions,
}: {
  programmeSnapshotIds: ReadonlySet<number>;
  relationships: readonly ProgrammeStructureRelationship[];
  requirementConditions: readonly ProgrammeStructureRequirementCondition[];
  requirementOptions: readonly ProgrammeStructureRequirementOption[];
}) {
  const codesBySnapshotId = new Map<
    number,
    Record<SelectableStructureKind, Set<string>>
  >();
  const addCode = (
    snapshotId: number,
    kind: SelectableStructureKind,
    code: string,
  ) => {
    if (!programmeSnapshotIds.has(snapshotId)) return;
    const codes =
      codesBySnapshotId.get(snapshotId) ??
      ({
        major: new Set<string>(),
        minor: new Set<string>(),
        specialisation: new Set<string>(),
      } satisfies Record<SelectableStructureKind, Set<string>>);
    codes[kind].add(code.toUpperCase());
    codesBySnapshotId.set(snapshotId, codes);
  };

  for (const relationship of relationships) {
    if (
      isSelectableStructureKind(relationship.target_kind) &&
      (relationship.relationship_kind === "required" ||
        relationship.relationship_kind === "option")
    ) {
      addCode(
        relationship.snapshot_id,
        relationship.target_kind,
        relationship.target_code,
      );
    }
  }

  const structureListConditions = new Map<
    number,
    ProgrammeStructureRequirementCondition & {
      structure_kind: SelectableStructureKind;
    }
  >();
  for (const condition of requirementConditions) {
    if (
      programmeSnapshotIds.has(condition.snapshot_id) &&
      condition.condition_kind === "structure_set" &&
      isSelectableStructureKind(condition.structure_kind)
    ) {
      structureListConditions.set(condition.id, {
        ...condition,
        structure_kind: condition.structure_kind,
      });
    }
  }

  for (const option of requirementOptions) {
    const condition = structureListConditions.get(option.condition_id);
    if (
      condition &&
      condition.snapshot_id === option.snapshot_id &&
      option.kind === condition.structure_kind
    ) {
      addCode(option.snapshot_id, condition.structure_kind, option.code);
    }
  }

  return new Map<number, SelectableStructureCodes>(
    [...codesBySnapshotId].map(([snapshotId, codes]) => [
      snapshotId,
      {
        major: [...codes.major].sort(),
        minor: [...codes.minor].sort(),
        specialisation: [...codes.specialisation].sort(),
      },
    ]),
  );
}
