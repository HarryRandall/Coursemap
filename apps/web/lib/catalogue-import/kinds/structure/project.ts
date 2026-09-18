import { stableFingerprint } from "../../canonical.ts";
import {
  parseAcademicStructureExtraction,
  type AcademicStructureExtraction,
  type AcademicStructureKind,
  type AcademicStructureRequirementRule,
} from "./contract.ts";
import { ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION } from "./prompt.ts";
import { canonicaliseAcademicStructureRelationships } from "./relationship-canonicalisation.ts";

export type AcademicStructureSnapshotProjection = {
  schemaVersion: typeof ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION;
  structureKind: AcademicStructureKind;
  structureCode: string;
  academicYear: number;
  snapshot: {
    title: string;
    acronym: string | null;
    shortName: string | null;
    introduction: string | null;
    description: string | null;
    totalUnits: number | null;
    durationYears: number | null;
    academicCareer: string | null;
    college: string | null;
    deliveryMode: string | null;
    selectionRank: number | null;
    atar: number | null;
    canCombine: boolean | null;
    canCombineVertical: boolean | null;
    studyAs: string | null;
    contactText: string | null;
    overallConfidence: number | null;
  };
  summaryFields: Array<{
    position: number;
    valuePosition: number;
    fieldKey: string;
    label: string;
    fieldValue: string;
    sourceText: string;
  }>;
  sections: Array<{
    position: number;
    sectionKey: string;
    heading: string;
    markdown: string;
    sourceText: string;
    sourceLocator: string;
  }>;
  learningOutcomes: Array<{
    position: number;
    outcomeText: string;
    sourceText: string;
    sourceLocator: string;
  }>;
  fees: AcademicStructureExtraction["fees"];
  relationships: AcademicStructureExtraction["relationships"];
  requirementRootKey: string | null;
  requirementGroups: Array<{
    key: string;
    parentGroupKey: string | null;
    position: number;
    operator: "all_of" | "any_of" | "minimum_count";
    minimumCount: number | null;
    minimumUnits: number | null;
    maximumUnits: number | null;
    title: string | null;
    description: string | null;
    sourceText: string;
    sourceLocator: string;
  }>;
  requirementConditions: Array<{
    key: string;
    groupKey: string;
    position: number;
    conditionKind:
      | "course_list"
      | "structure_list"
      | "unit_total"
      | "level"
      | "subject"
      | "tag"
      | "unrestricted"
      | "free_text";
    minimumUnits: number | null;
    maximumUnits: number | null;
    minimumCourses: number | null;
    structureKind: AcademicStructureKind | null;
    subjectCode: string | null;
    minimumLevel: number | null;
    maximumLevel: number | null;
    tag: string | null;
    freeText: string | null;
    sourceText: string;
    sourceLocator: string;
  }>;
  requirementOptions: Array<{
    conditionKey: string;
    position: number;
    optionKind: "course" | "structure";
    optionCode: string;
    structureKind: AcademicStructureKind | null;
  }>;
  unmodelledRequirements: Array<{
    position: number;
    sourceText: string;
    sourceLocator: string | null;
  }>;
  evidence: Array<
    AcademicStructureExtraction["evidence"][number] & {
      position: number;
    }
  >;
  reviewItems: AcademicStructureExtraction["reviewItems"];
  projectionSha256: string;
};

type ProjectionWithoutHash = Omit<
  AcademicStructureSnapshotProjection,
  "projectionSha256"
>;

function flattenRequirementRule(
  rule: AcademicStructureRequirementRule,
  parentGroupKey: string | null,
  position: number,
  groups: ProjectionWithoutHash["requirementGroups"],
  conditions: ProjectionWithoutHash["requirementConditions"],
  options: ProjectionWithoutHash["requirementOptions"],
  keys: Set<string>,
) {
  if (keys.has(rule.key)) {
    throw new TypeError(
      `Duplicate academic structure requirement key: ${rule.key}`,
    );
  }
  keys.add(rule.key);

  if (rule.type === "condition") {
    if (!parentGroupKey) {
      throw new TypeError(
        "An academic structure requirement condition must belong to a group.",
      );
    }
    conditions.push({
      key: rule.key,
      groupKey: parentGroupKey,
      position,
      conditionKind: rule.conditionKind,
      minimumUnits: rule.minimumUnits,
      maximumUnits: rule.maximumUnits,
      minimumCourses: rule.minimumCourses,
      structureKind: rule.structureKind,
      subjectCode: rule.subjectCode,
      minimumLevel: rule.minimumLevel,
      maximumLevel: rule.maximumLevel,
      tag: rule.tag,
      freeText: rule.freeText,
      sourceText: rule.sourceText,
      sourceLocator: rule.sourceLocator,
    });
    rule.courseCodes.forEach((optionCode, index) =>
      options.push({
        conditionKey: rule.key,
        position: index + 1,
        optionKind: "course",
        optionCode,
        structureKind: null,
      }),
    );
    rule.structureCodes.forEach((optionCode, index) =>
      options.push({
        conditionKey: rule.key,
        position: rule.courseCodes.length + index + 1,
        optionKind: "structure",
        optionCode,
        structureKind: rule.structureKind,
      }),
    );
    return;
  }

  groups.push({
    key: rule.key,
    parentGroupKey,
    position,
    operator: rule.operator,
    minimumCount: rule.minimumCount,
    minimumUnits: null,
    maximumUnits: null,
    title: rule.title,
    description: null,
    sourceText: rule.sourceText,
    sourceLocator: rule.sourceLocator,
  });
  rule.children.forEach((child, index) =>
    flattenRequirementRule(
      child,
      rule.key,
      index + 1,
      groups,
      conditions,
      options,
      keys,
    ),
  );
}

export function projectAcademicStructureSnapshot(
  value: AcademicStructureExtraction,
): AcademicStructureSnapshotProjection {
  const extraction = parseAcademicStructureExtraction(value);
  const requirementGroups: ProjectionWithoutHash["requirementGroups"] = [];
  const requirementConditions: ProjectionWithoutHash["requirementConditions"] =
    [];
  const requirementOptions: ProjectionWithoutHash["requirementOptions"] = [];
  const keys = new Set<string>();
  if (extraction.requirements.rule) {
    flattenRequirementRule(
      extraction.requirements.rule,
      null,
      1,
      requirementGroups,
      requirementConditions,
      requirementOptions,
      keys,
    );
  }

  const projection: ProjectionWithoutHash = {
    schemaVersion: ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
    structureKind: extraction.kind,
    structureCode: extraction.code,
    academicYear: extraction.year,
    snapshot: {
      title: extraction.title,
      acronym: extraction.acronym,
      shortName: extraction.shortName,
      introduction: extraction.introduction,
      description: extraction.description,
      totalUnits: extraction.totalUnits,
      durationYears: extraction.durationYears,
      academicCareer: extraction.academicCareer,
      college: extraction.college,
      deliveryMode: extraction.deliveryMode,
      selectionRank: extraction.selectionRank,
      atar: extraction.atar,
      canCombine: extraction.canCombine,
      canCombineVertical: extraction.canCombineVertical,
      studyAs: extraction.studyAs,
      contactText: extraction.contactText,
      overallConfidence: extraction.overallConfidence,
    },
    summaryFields: extraction.summaryFields.flatMap((field) =>
      field.values.map((fieldValue, index) => ({
        position: field.position,
        valuePosition: index + 1,
        fieldKey: field.key,
        label: field.label,
        fieldValue,
        sourceText: field.sourceText,
      })),
    ),
    sections: extraction.sections.map((section) => ({
      position: section.position,
      sectionKey: section.key,
      heading: section.heading,
      markdown: section.markdown,
      sourceText: section.sourceText,
      sourceLocator: section.sourceLocator,
    })),
    learningOutcomes: extraction.learningOutcomes.map((outcome) => ({
      position: outcome.position,
      outcomeText: outcome.text,
      sourceText: outcome.sourceText,
      sourceLocator: outcome.sourceLocator,
    })),
    fees: extraction.fees,
    relationships: canonicaliseAcademicStructureRelationships(
      extraction.relationships,
    ),
    requirementRootKey: extraction.requirements.rule?.key ?? null,
    requirementGroups,
    requirementConditions,
    requirementOptions,
    unmodelledRequirements: extraction.requirements.unmodelledText.map(
      (sourceText, index) => ({
        position: index + 1,
        sourceText,
        sourceLocator: extraction.requirements.sourceLocator,
      }),
    ),
    evidence: extraction.evidence.map((item, index) => ({
      position: index + 1,
      ...item,
    })),
    reviewItems: extraction.reviewItems,
  };
  return {
    ...projection,
    projectionSha256: stableFingerprint(projection),
  };
}
