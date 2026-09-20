import type { CourseSnapshotProjection } from "./kinds/course/project.ts";
import type { AcademicStructureSnapshotProjection } from "./kinds/structure/project.ts";

export type CatalogueKind =
  "course" | "programme" | "major" | "minor" | "specialisation";

export const CATALOGUE_KINDS: readonly CatalogueKind[] = [
  "course",
  "programme",
  "major",
  "minor",
  "specialisation",
];

export function isCatalogueKind(value: unknown): value is CatalogueKind {
  return (
    typeof value === "string" &&
    CATALOGUE_KINDS.includes(value as CatalogueKind)
  );
}

export type RequirementRuleKind =
  | "prerequisite"
  | "corequisite"
  | "incompatibility"
  | "permission"
  | "assumed_knowledge"
  | "structure";

export type RequirementConditionKind =
  | "course"
  | "incompatible"
  | "structure"
  | "structure_set"
  | "course_set_units"
  | "units_total"
  | "subject_units"
  | "level_units"
  | "tagged_units"
  | "elective_units"
  | "year_standing"
  | "gpa"
  | "wam"
  | "permission"
  | "other";

export type ReviewState = "automatic" | "verified" | "review";

export type RequirementWrite = {
  rules: Array<{
    key: RequirementRuleKind;
    hardness: "hard" | "advisory";
    sourceText: string;
    sourceLocator: string | null;
    reviewState: ReviewState;
    confidence: number;
    position: number;
  }>;
  groups: Array<{
    key: string;
    ruleKey: RequirementRuleKind;
    parentKey: string | null;
    label: string | null;
    description: string | null;
    operator: "all_of" | "any_of" | "at_least";
    minimumCount: number | null;
    minimumUnits: number | null;
    maximumUnits: number | null;
    sourceText: string | null;
    sourceLocator: string | null;
    position: number;
  }>;
  conditions: Array<{
    key: string;
    ruleKey: RequirementRuleKind;
    groupKey: string;
    position: number;
    kind: RequirementConditionKind;
    /** Catalogue code for course, incompatible and structure conditions. */
    itemCode: string | null;
    itemKind: CatalogueKind | null;
    structureKind: Exclude<CatalogueKind, "course"> | null;
    requirementMode: "completed" | "completed_or_concurrent" | null;
    minimumMark: number | null;
    minimumUnits: number | null;
    maximumUnits: number | null;
    minimumCount: number | null;
    subjectCode: string | null;
    minimumLevel: number | null;
    maximumLevel: number | null;
    minimumYear: number | null;
    minimumGpa: number | null;
    minimumWam: number | null;
    tag: string | null;
    freeText: string | null;
    hardness: "hard" | "advisory";
    sourceText: string | null;
    sourceLocator: string | null;
    reviewState: ReviewState;
    confidence: number;
  }>;
  options: Array<{
    conditionKey: string;
    position: number;
    kind: CatalogueKind;
    code: string;
    title: string | null;
    sourceText: string | null;
  }>;
  references: Array<{
    ruleKey: RequirementRuleKind;
    code: string;
    sourceText: string;
    confidence: number;
    reviewState: ReviewState;
  }>;
};

export type SnapshotEvidenceWrite = {
  fieldPath: string;
  method: "deterministic" | "model" | "manual";
  confidence: number | null;
  sourceLocator: string | null;
  sourceExcerpt: string | null;
};

export type SnapshotFlagWrite = {
  fieldPath: string | null;
  severity: "warning" | "error";
  code: string;
  message: string;
  sourceExcerpt: string | null;
};

export type CourseContentWrite = {
  details: CourseSnapshotProjection["snapshot"];
  unitOptions: CourseSnapshotProjection["unitOptions"];
  fees: CourseSnapshotProjection["fees"];
  areasOfInterest: CourseSnapshotProjection["areasOfInterest"];
  attributes: CourseSnapshotProjection["attributes"];
  relatedCourses: CourseSnapshotProjection["relatedCourses"];
  offering: CourseSnapshotProjection["courseOffering"];
  sessions: CourseSnapshotProjection["offeringSessions"];
  learningOutcomes: CourseSnapshotProjection["learningOutcomes"];
  assessmentItems: CourseSnapshotProjection["assessmentItems"];
  assessmentOutcomes: CourseSnapshotProjection["assessmentOutcomes"];
};

export type StructureContentWrite = {
  details: {
    name: string;
    acronym: string | null;
    shortName: string | null;
    introduction: string | null;
    description: string | null;
    units: number | null;
    durationYears: number | null;
    academicCareer: string | null;
    college: string | null;
    modeOfDelivery: string | null;
    selectionRank: number | null;
    atar: number | null;
    canCombine: boolean | null;
    canCombineVertical: boolean | null;
    studyAs: string | null;
    contactText: string | null;
  };
  summaryFields: AcademicStructureSnapshotProjection["summaryFields"];
  sections: AcademicStructureSnapshotProjection["sections"];
  learningOutcomes: AcademicStructureSnapshotProjection["learningOutcomes"];
  fees: AcademicStructureSnapshotProjection["fees"];
  relationships: AcademicStructureSnapshotProjection["relationships"];
};

/**
 * Everything needed to assemble one catalogue snapshot. Kind-specific content
 * sits under `course` or `structure`; requirements, evidence and flags use the
 * shared shape. `contentHash` identifies the content for change detection.
 */
export type CatalogueSnapshotWrite = {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  contentHash: string;
  course: CourseContentWrite | null;
  structure: StructureContentWrite | null;
  requirements: RequirementWrite;
  evidence: SnapshotEvidenceWrite[];
  flags: SnapshotFlagWrite[];
};

type CourseProjectionCondition =
  CourseSnapshotProjection["ruleConditions"][number];

function courseConditionKind(
  kind: CourseProjectionCondition["conditionKind"],
): RequirementConditionKind {
  return kind === "admission" ? "structure" : kind;
}

export function courseSnapshotWrite({
  projection,
  evidence = [],
  flags = [],
}: {
  projection: CourseSnapshotProjection;
  evidence?: SnapshotEvidenceWrite[];
  flags?: SnapshotFlagWrite[];
}): CatalogueSnapshotWrite {
  const ruleOrder: RequirementRuleKind[] = [
    "prerequisite",
    "corequisite",
    "incompatibility",
    "permission",
    "assumed_knowledge",
  ];
  return {
    kind: "course",
    code: projection.courseCode,
    academicYear: projection.academicYear,
    contentHash: projection.projectionSha256,
    course: {
      details: projection.snapshot,
      unitOptions: projection.unitOptions,
      fees: projection.fees,
      areasOfInterest: projection.areasOfInterest,
      attributes: projection.attributes,
      relatedCourses: projection.relatedCourses,
      offering: projection.courseOffering,
      sessions: projection.offeringSessions,
      learningOutcomes: projection.learningOutcomes,
      assessmentItems: projection.assessmentItems,
      assessmentOutcomes: projection.assessmentOutcomes,
    },
    structure: null,
    requirements: {
      rules: projection.rules.map((rule) => ({
        key: rule.ruleKind,
        hardness: rule.hardness,
        sourceText: rule.sourceText,
        sourceLocator: null,
        reviewState: "automatic",
        confidence: 1,
        position: Math.max(0, ruleOrder.indexOf(rule.ruleKind)),
      })),
      groups: projection.ruleGroups.map((group) => ({
        key: group.key,
        ruleKey: group.ruleKey,
        parentKey: group.parentGroupKey,
        label: null,
        description: null,
        operator: group.operator,
        minimumCount: group.minimumCount,
        minimumUnits: null,
        maximumUnits: null,
        sourceText: null,
        sourceLocator: null,
        position: group.position,
      })),
      conditions: projection.ruleConditions.map((condition) => {
        const kind = courseConditionKind(condition.conditionKind);
        const itemCode =
          kind === "course" || kind === "incompatible"
            ? condition.requiredCourseCode
            : kind === "structure"
              ? condition.requiredStructureCode
              : null;
        return {
          key: condition.key,
          ruleKey: condition.ruleKey,
          groupKey: condition.groupKey,
          position: condition.position,
          kind,
          itemCode,
          itemKind:
            itemCode === null
              ? null
              : kind === "structure"
                ? "programme"
                : "course",
          structureKind: null,
          requirementMode: condition.courseRequirementMode,
          minimumMark: condition.minimumMark,
          minimumUnits: condition.minimumUnits,
          maximumUnits: null,
          minimumCount: null,
          subjectCode: condition.subjectCode,
          minimumLevel: condition.minimumCourseLevel,
          maximumLevel: condition.maximumCourseLevel,
          minimumYear: condition.minimumYear,
          minimumGpa: condition.minimumGpa,
          minimumWam: condition.minimumWam,
          tag: null,
          freeText: condition.freeText,
          hardness: condition.hardness,
          sourceText: condition.sourceText,
          sourceLocator: null,
          reviewState: "automatic",
          confidence: 1,
        };
      }),
      options: projection.ruleConditionCourses.map((member) => ({
        conditionKey: member.conditionKey,
        position: member.position,
        kind: "course",
        code: member.sourceCourseCode,
        title: null,
        sourceText: member.sourceText,
      })),
      references: projection.ruleCourseReferences.map((reference) => ({
        ruleKey: reference.ruleKey,
        code: reference.referencedCourseCode,
        sourceText: reference.sourceText,
        confidence: 0,
        reviewState: "review",
      })),
    },
    evidence,
    flags,
  };
}

type StructureProjectionCondition =
  AcademicStructureSnapshotProjection["requirementConditions"][number];

function structureConditionKind(
  kind: StructureProjectionCondition["conditionKind"],
): RequirementConditionKind {
  switch (kind) {
    case "course_list":
      return "course_set_units";
    case "structure_list":
      return "structure_set";
    case "unit_total":
      return "units_total";
    case "level":
      return "level_units";
    case "subject":
      return "subject_units";
    case "tag":
      return "tagged_units";
    case "unrestricted":
      return "elective_units";
    default:
      return "other";
  }
}

export function structureSnapshotWrite({
  projection,
  evidence = [],
  flags = [],
}: {
  projection: AcademicStructureSnapshotProjection;
  evidence?: SnapshotEvidenceWrite[];
  flags?: SnapshotFlagWrite[];
}): CatalogueSnapshotWrite {
  const hasRequirements = projection.requirementRootKey !== null;
  const rootSourceText =
    projection.requirementGroups.find(
      (group) => group.key === projection.requirementRootKey,
    )?.sourceText ?? `${projection.snapshot.title} requirements`;
  // Unmodelled entries follow the last condition already under the root, so
  // positions stay unique within that group.
  const unmodelledStart =
    projection.requirementConditions
      .filter(
        (condition) => condition.groupKey === projection.requirementRootKey,
      )
      .reduce(
        (highest, condition) => Math.max(highest, condition.position),
        0,
      ) + 1;
  return {
    kind: projection.structureKind,
    code: projection.structureCode,
    academicYear: projection.academicYear,
    contentHash: projection.projectionSha256,
    course: null,
    structure: {
      details: {
        name: projection.snapshot.title,
        acronym: projection.snapshot.acronym,
        shortName: projection.snapshot.shortName,
        introduction: projection.snapshot.introduction,
        description: projection.snapshot.description,
        units: projection.snapshot.totalUnits,
        durationYears: projection.snapshot.durationYears,
        academicCareer: projection.snapshot.academicCareer,
        college: projection.snapshot.college,
        modeOfDelivery: projection.snapshot.deliveryMode,
        selectionRank: projection.snapshot.selectionRank,
        atar: projection.snapshot.atar,
        canCombine: projection.snapshot.canCombine,
        canCombineVertical: projection.snapshot.canCombineVertical,
        studyAs: projection.snapshot.studyAs,
        contactText: projection.snapshot.contactText,
      },
      summaryFields: projection.summaryFields,
      sections: projection.sections,
      learningOutcomes: projection.learningOutcomes,
      fees: projection.fees,
      relationships: projection.relationships,
    },
    requirements: hasRequirements
      ? {
          rules: [
            {
              key: "structure",
              hardness: "hard",
              sourceText: rootSourceText,
              sourceLocator: null,
              reviewState: "automatic",
              confidence: 1,
              position: 0,
            },
          ],
          groups: projection.requirementGroups.map((group) => ({
            key: group.key,
            ruleKey: "structure",
            parentKey: group.parentGroupKey,
            label: group.title,
            description: group.description,
            operator:
              group.operator === "minimum_count" ? "at_least" : group.operator,
            minimumCount: group.minimumCount,
            minimumUnits: group.minimumUnits,
            maximumUnits: group.maximumUnits,
            sourceText: group.sourceText,
            sourceLocator: group.sourceLocator,
            position: group.position,
          })),
          conditions: [
            ...projection.requirementConditions.map((condition) => ({
              key: condition.key,
              ruleKey: "structure" as const,
              groupKey: condition.groupKey,
              position: condition.position,
              kind: structureConditionKind(condition.conditionKind),
              itemCode: null,
              itemKind: null,
              structureKind: condition.structureKind,
              requirementMode: null,
              minimumMark: null,
              minimumUnits: condition.minimumUnits,
              maximumUnits: condition.maximumUnits,
              minimumCount: condition.minimumCourses,
              subjectCode: condition.subjectCode,
              minimumLevel: condition.minimumLevel,
              maximumLevel: condition.maximumLevel,
              minimumYear: null,
              minimumGpa: null,
              minimumWam: null,
              tag: condition.tag,
              freeText:
                condition.conditionKind === "free_text"
                  ? (condition.freeText ?? condition.sourceText)
                  : condition.freeText,
              hardness: "hard" as const,
              sourceText: condition.sourceText,
              sourceLocator: condition.sourceLocator,
              reviewState: "automatic" as const,
              confidence: 1,
            })),
            // Source wording the parser could not model keeps its place as an
            // `other` condition under the root group so students still see it.
            ...projection.unmodelledRequirements.map((item, index) => ({
              key: `unmodelled:${item.position}`,
              ruleKey: "structure" as const,
              groupKey: projection.requirementRootKey!,
              position: unmodelledStart + index,
              kind: "other" as const,
              itemCode: null,
              itemKind: null,
              structureKind: null,
              requirementMode: null,
              minimumMark: null,
              minimumUnits: null,
              maximumUnits: null,
              minimumCount: null,
              subjectCode: null,
              minimumLevel: null,
              maximumLevel: null,
              minimumYear: null,
              minimumGpa: null,
              minimumWam: null,
              tag: null,
              freeText: item.sourceText,
              hardness: "hard" as const,
              sourceText: item.sourceText,
              sourceLocator: item.sourceLocator,
              reviewState: "review" as const,
              confidence: 0,
            })),
          ],
          options: projection.requirementOptions.map((option) => ({
            conditionKey: option.conditionKey,
            position: option.position,
            kind:
              option.optionKind === "course"
                ? "course"
                : (option.structureKind ?? "programme"),
            code: option.optionCode,
            title: null,
            sourceText: null,
          })),
          references: [],
        }
      : { rules: [], groups: [], conditions: [], options: [], references: [] },
    evidence,
    flags,
  };
}
