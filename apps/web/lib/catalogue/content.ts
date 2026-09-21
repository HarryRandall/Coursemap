import type { CourseSnapshotProjection } from "../catalogue-import/kinds/course/project.ts";
import type { AcademicStructureSnapshotProjection } from "../catalogue-import/kinds/structure/project.ts";

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

export type CatalogueVersionProvenance = {
  fieldPath: string;
  method: "deterministic" | "model" | "manual";
  confidence: number | null;
  sourceLocator: string | null;
  sourceExcerpt: string | null;
};

export type CatalogueContentFlag = {
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
 * Everything needed to assemble one catalogue version. Kind-specific content
 * is discriminated by `kind`; requirements, provenance and flags use the
 * shared shape. `contentHash` identifies the content for change detection.
 */
type CatalogueContentBase = {
  code: string;
  academicYear: number;
  contentHash: string;
  requirements: RequirementWrite;
  evidence: CatalogueVersionProvenance[];
  flags: CatalogueContentFlag[];
};

export type CatalogueContent = CatalogueContentBase &
  (
    | {
        kind: "course";
        course: CourseContentWrite;
        structure?: never;
      }
    | {
        kind: Exclude<CatalogueKind, "course">;
        course?: never;
        structure: StructureContentWrite;
      }
  );

export const CATALOGUE_CONTENT_SCHEMA_VERSION = 1;

const EMPTY_REQUIREMENTS: RequirementWrite = {
  rules: [],
  groups: [],
  conditions: [],
  options: [],
  references: [],
};

/** A valid starting aggregate for a catalogue record with no source version. */
export function emptyCatalogueContent({
  kind,
  code,
  academicYear,
  title,
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  title?: string | null;
}): CatalogueContent {
  const contentHash = "0".repeat(64);
  const common = {
    code,
    academicYear,
    contentHash,
    requirements: structuredClone(EMPTY_REQUIREMENTS),
    evidence: [],
    flags: [],
  };
  if (kind !== "course") {
    return {
      ...common,
      kind,
      structure: {
        details: {
          name: title?.trim() || code,
          acronym: null,
          shortName: null,
          introduction: null,
          description: null,
          units: null,
          durationYears: null,
          academicCareer: null,
          college: null,
          modeOfDelivery: null,
          selectionRank: null,
          atar: null,
          canCombine: null,
          canCombineVertical: null,
          studyAs: null,
          contactText: null,
        },
        summaryFields: [],
        sections: [],
        learningOutcomes: [],
        fees: [],
        relationships: [],
      },
    };
  }
  const numericCode = Number(code.match(/[0-9]{4}/)?.[0] ?? 0);
  return {
    ...common,
    kind,
    course: {
      details: {
        title: title?.trim() || code,
        unitValueKind: "fixed",
        units: 6,
        minimumUnits: null,
        maximumUnits: null,
        eftsl: null,
        level: Math.floor(numericCode / 1000) * 1000,
        subjectCode: code.slice(0, 4),
        subjectName: null,
        school: null,
        college: null,
        academicCareer: null,
        convenerText: null,
        deliverySummary: null,
        introduction: null,
        description: null,
        workloadText: null,
        workloadHours: null,
        inherentRequirements: null,
        prescribedTexts: null,
        offeringStatus: "unknown",
        sourceUpdatedAt: null,
      },
      unitOptions: [],
      fees: [],
      areasOfInterest: [],
      attributes: [],
      relatedCourses: [],
      offering: null,
      sessions: [],
      learningOutcomes: [],
      assessmentItems: [],
      assessmentOutcomes: [],
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasObjectRows(value: Record<string, unknown>, keys: string[]) {
  return keys.every(
    (key) =>
      Array.isArray(value[key]) && value[key].every((row) => isObject(row)),
  );
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
}

function hasString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" && record[key].trim() !== "";
}

/**
 * Validates the complete aggregate at the server boundary. Detailed field
 * constraints remain enforced by immutable version materialisation.
 */
export function validateCatalogueContent(value: unknown): CatalogueContent {
  if (!isObject(value) || !isCatalogueKind(value.kind))
    throw new TypeError("The catalogue content kind is not recognised.");
  if (!isJsonValue(value))
    throw new TypeError(
      "The catalogue content must contain valid JSON values.",
    );
  if (typeof value.code !== "string" || !value.code.trim())
    throw new TypeError("The catalogue content code is required.");
  if (!Number.isInteger(value.academicYear))
    throw new TypeError("The catalogue content year is required.");
  if (!isObject(value.requirements))
    throw new TypeError("The catalogue requirements are required.");
  if (
    !hasObjectRows(value.requirements, [
      "rules",
      "groups",
      "conditions",
      "options",
      "references",
    ]) ||
    !Array.isArray(value.evidence) ||
    !value.evidence.every((entry) => isObject(entry)) ||
    !Array.isArray(value.flags) ||
    !value.flags.every((flag) => isObject(flag))
  ) {
    throw new TypeError("The catalogue content aggregate is incomplete.");
  }
  const requirements = value.requirements as Record<
    string,
    Array<Record<string, unknown>>
  >;
  if (
    !requirements.rules!.every((rule) => hasString(rule, "key")) ||
    !requirements.groups!.every(
      (group) => hasString(group, "key") && hasString(group, "ruleKey"),
    ) ||
    !requirements.conditions!.every(
      (condition) =>
        hasString(condition, "key") &&
        hasString(condition, "ruleKey") &&
        hasString(condition, "groupKey") &&
        hasString(condition, "kind"),
    ) ||
    !requirements.options!.every(
      (option) =>
        hasString(option, "conditionKey") &&
        hasString(option, "kind") &&
        hasString(option, "code"),
    ) ||
    !requirements.references!.every(
      (reference) =>
        hasString(reference, "ruleKey") && hasString(reference, "code"),
    ) ||
    !value.evidence.every(
      (entry) => hasString(entry, "fieldPath") && hasString(entry, "method"),
    ) ||
    !value.flags.every(
      (flag) =>
        hasString(flag, "severity") &&
        hasString(flag, "code") &&
        hasString(flag, "message"),
    )
  ) {
    throw new TypeError("The catalogue content aggregate is invalid.");
  }
  if (value.kind === "course") {
    if (
      !isObject(value.course) ||
      !isObject(value.course.details) ||
      value.structure !== undefined
    )
      throw new TypeError("The course details are required.");
    if (
      typeof value.course.details.title !== "string" ||
      !value.course.details.title.trim() ||
      !hasObjectRows(value.course, [
        "unitOptions",
        "fees",
        "areasOfInterest",
        "attributes",
        "relatedCourses",
        "sessions",
        "learningOutcomes",
        "assessmentItems",
        "assessmentOutcomes",
      ])
    ) {
      throw new TypeError("The course content aggregate is incomplete.");
    }
  } else {
    if (
      !isObject(value.structure) ||
      !isObject(value.structure.details) ||
      value.course !== undefined
    )
      throw new TypeError("The structure details are required.");
    if (
      typeof value.structure.details.name !== "string" ||
      !value.structure.details.name.trim() ||
      !hasObjectRows(value.structure, [
        "summaryFields",
        "sections",
        "learningOutcomes",
        "fees",
        "relationships",
      ])
    ) {
      throw new TypeError("The structure content aggregate is incomplete.");
    }
  }
  return structuredClone(value) as CatalogueContent;
}

type CourseProjectionCondition =
  CourseSnapshotProjection["ruleConditions"][number];

function courseConditionKind(
  kind: CourseProjectionCondition["conditionKind"],
): RequirementConditionKind {
  return kind === "admission" ? "structure" : kind;
}

export function courseCatalogueContent({
  projection,
  evidence = [],
  flags = [],
}: {
  projection: CourseSnapshotProjection;
  evidence?: CatalogueVersionProvenance[];
  flags?: CatalogueContentFlag[];
}): CatalogueContent {
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

export function structureCatalogueContent({
  projection,
  evidence = [],
  flags = [],
}: {
  projection: AcademicStructureSnapshotProjection;
  evidence?: CatalogueVersionProvenance[];
  flags?: CatalogueContentFlag[];
}): CatalogueContent {
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
