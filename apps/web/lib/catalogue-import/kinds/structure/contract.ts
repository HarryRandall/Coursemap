import { z } from "zod";
import {
  STRUCTURE_RELATIONSHIP_KINDS,
  STRUCTURE_SECTION_KEYS,
  type StructureRelationshipKind,
  type StructureSectionKey,
} from "../../../catalogue/structure-vocabulary.ts";

export const ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION =
  "academic-structure-extraction.v4" as const;

export const ACADEMIC_STRUCTURE_KINDS = [
  "programme",
  "major",
  "minor",
  "specialisation",
] as const;

export type AcademicStructureKind = (typeof ACADEMIC_STRUCTURE_KINDS)[number];

export function isAcademicStructureKind(
  value: unknown,
): value is AcademicStructureKind {
  return (
    typeof value === "string" &&
    ACADEMIC_STRUCTURE_KINDS.includes(value as AcademicStructureKind)
  );
}

export const ACADEMIC_STRUCTURE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
export const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/;

export type AcademicStructureSummaryField = {
  position: number;
  key: string;
  label: string;
  values: string[];
  sourceText: string;
};

/** One fixed information section; its heading comes from the key. */
export type AcademicStructureSection = {
  key: StructureSectionKey;
  markdown: string;
  sourceText: string;
  sourceLocator: string;
};

export type AcademicStructureLearningOutcome = {
  position: number;
  text: string;
  sourceText: string;
  sourceLocator: string;
};

export type AcademicStructureFee = {
  position: number;
  feeYear: number | null;
  audience: "domestic" | "international" | "commonwealth_supported" | "other";
  feeType: "student_contribution" | "tuition" | "indicative" | "other";
  amount: number | null;
  currency: "AUD" | null;
  basis: "programme" | "unit" | "eftsl" | "annual" | "unknown";
  sourceLabel: string | null;
  sourceText: string;
  sourceLocator: string;
};

export type AcademicStructureRelationship = {
  position: number;
  relationshipKind: StructureRelationshipKind;
  targetKind: AcademicStructureKind;
  targetCode: string;
  targetTitle: string | null;
  sourceText: string;
  sourceLocator: string;
};

export type AcademicStructureRequirementGroup = {
  type: "group";
  key: string;
  operator: "all_of" | "any_of" | "minimum_count";
  minimumCount: number | null;
  /** See {@link AcademicStructureRequirementCondition.scope}. */
  scope: RequirementScope;
  title: string | null;
  sourceText: string;
  sourceLocator: string;
  children: AcademicStructureRequirementRule[];
};

/**
 * `part` fills a share of the degree, and a course counted here counts
 * nowhere else. `degree` constrains every course the degree counts, such as
 * "of which a maximum of 60 units from 1000-level courses", without using any
 * course up.
 */
export type RequirementScope = "part" | "degree";

export type AcademicStructureRequirementCondition = {
  type: "condition";
  key: string;
  conditionKind:
    | "course_list"
    | "consecutive_semester_pair"
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
  courseCodes: string[];
  structureKind: AcademicStructureKind | null;
  structureCodes: string[];
  subjectCode: string | null;
  minimumLevel: number | null;
  maximumLevel: number | null;
  tag: string | null;
  freeText: string | null;
  scope: RequirementScope;
  /** A course list that ends "Any other ANU courses": the list is suggestions. */
  includesAnyCourse: boolean;
  sourceText: string;
  sourceLocator: string;
};

export type AcademicStructureRequirementRule =
  AcademicStructureRequirementGroup | AcademicStructureRequirementCondition;

export type AcademicStructureRequirements = {
  sourceText: string | null;
  sourceLocator: string | null;
  rule: AcademicStructureRequirementRule | null;
  unmodelledText: string[];
};

export type AcademicStructureExtractionEvidence = {
  fieldKey: string;
  sourceLocator: string;
  evidenceExcerpt: string;
  confidence: number;
  method: "model";
};

export type AcademicStructureExtractionReviewItem = {
  fieldKey: string;
  kind:
    | "missing"
    | "ambiguous"
    | "conflict"
    | "unsupported"
    | "invalid"
    | "model_repair"
    | "evidence_missing";
  severity: "warning" | "error";
  message: string;
};

/**
 * The complete extraction contract. Every property is present so stored model
 * output can be compared without treating omitted keys as facts.
 */
export type AcademicStructureExtraction = {
  schemaVersion: typeof ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION;
  kind: AcademicStructureKind;
  code: string;
  year: number;
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
  summaryFields: AcademicStructureSummaryField[];
  sections: AcademicStructureSection[];
  learningOutcomes: AcademicStructureLearningOutcome[];
  fees: AcademicStructureFee[];
  relationships: AcademicStructureRelationship[];
  requirements: AcademicStructureRequirements;
  evidence: AcademicStructureExtractionEvidence[];
  overallConfidence: number | null;
  reviewItems: AcademicStructureExtractionReviewItem[];
};

export type AcademicStructureExtractionValidationIssue = {
  path: string;
  message: string;
};

export type AcademicStructureExtractionValidationOptions = {
  expectedKind?: AcademicStructureKind;
  expectedCode?: string;
  expectedYear?: number;
};

export type AcademicStructureExtractionValidationResult =
  | {
      success: true;
      data: AcademicStructureExtraction;
      issues: [];
    }
  | {
      success: false;
      issues: AcademicStructureExtractionValidationIssue[];
    };

const nonEmptyString = z.string().trim().min(1);
const nullableString = nonEmptyString.nullable().default(null);
const position = z.number().int().positive();
const nullableUnits = z
  .number()
  .finite()
  .nonnegative()
  .nullable()
  .default(null);
const nullableRequirementUnits = z
  .number()
  .finite()
  .positive()
  .nullable()
  .default(null);
const structureKindSchema = z.enum(ACADEMIC_STRUCTURE_KINDS);

const summaryFieldSchema = z
  .object({
    position,
    key: nonEmptyString.regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    label: nonEmptyString,
    values: z.array(nonEmptyString).min(1),
    sourceText: nonEmptyString,
  })
  .strict();

const sectionSchema = z
  .object({
    key: z.enum(STRUCTURE_SECTION_KEYS),
    markdown: nonEmptyString,
    sourceText: nonEmptyString,
    sourceLocator: nonEmptyString,
  })
  .strict();

const learningOutcomeSchema = z
  .object({
    position,
    text: nonEmptyString,
    sourceText: nonEmptyString,
    sourceLocator: nonEmptyString,
  })
  .strict();

const feeSchema = z
  .object({
    position,
    feeYear: z.number().int().min(2000).max(2200).nullable().default(null),
    audience: z.enum([
      "domestic",
      "international",
      "commonwealth_supported",
      "other",
    ]),
    feeType: z.enum(["student_contribution", "tuition", "indicative", "other"]),
    amount: nullableUnits,
    currency: z.literal("AUD").nullable().default(null),
    basis: z.enum(["programme", "unit", "eftsl", "annual", "unknown"]),
    sourceLabel: nullableString,
    sourceText: nonEmptyString,
    sourceLocator: nonEmptyString,
  })
  .strict();

const relationshipSchema = z
  .object({
    position,
    relationshipKind: z.enum(STRUCTURE_RELATIONSHIP_KINDS),
    targetKind: structureKindSchema,
    targetCode: nonEmptyString,
    targetTitle: nullableString,
    sourceText: nonEmptyString,
    sourceLocator: nonEmptyString,
  })
  .strict();

const requirementConditionSchema: z.ZodType<AcademicStructureRequirementCondition> =
  z
    .object({
      type: z.literal("condition"),
      key: nonEmptyString,
      conditionKind: z.enum([
        "course_list",
        "consecutive_semester_pair",
        "structure_list",
        "unit_total",
        "level",
        "subject",
        "tag",
        "unrestricted",
        "free_text",
      ]),
      minimumUnits: nullableRequirementUnits,
      maximumUnits: nullableRequirementUnits,
      minimumCourses: z.number().int().positive().nullable().default(null),
      courseCodes: z.array(nonEmptyString.regex(COURSE_CODE_PATTERN)),
      structureKind: structureKindSchema.nullable().default(null),
      structureCodes: z.array(
        nonEmptyString.regex(ACADEMIC_STRUCTURE_CODE_PATTERN),
      ),
      subjectCode: nonEmptyString
        .regex(/^[A-Z]{4}$/)
        .nullable()
        .default(null),
      minimumLevel: z.number().int().min(0).max(9999).nullable().default(null),
      maximumLevel: z.number().int().min(0).max(9999).nullable().default(null),
      tag: nullableString,
      freeText: nullableString,
      scope: z.enum(["part", "degree"]).default("part"),
      includesAnyCourse: z.boolean().default(false),
      sourceText: nonEmptyString,
      sourceLocator: nonEmptyString,
    })
    .strict()
    .superRefine((condition, context) => {
      const unexpected = (
        path: keyof AcademicStructureRequirementCondition,
        message: string,
      ) => {
        context.addIssue({ code: "custom", path: [path], message });
      };
      const hasUnits =
        condition.minimumUnits !== null || condition.maximumUnits !== null;
      const disallowCommonReferences = ({
        allowCourseCodes = false,
        allowStructureCodes = false,
        allowSubject = false,
        allowLevels = false,
        allowTag = false,
        allowFreeText = false,
        allowMinimumCourses = false,
        allowUnits = false,
      }: {
        allowCourseCodes?: boolean;
        allowStructureCodes?: boolean;
        allowSubject?: boolean;
        allowLevels?: boolean;
        allowTag?: boolean;
        allowFreeText?: boolean;
        allowMinimumCourses?: boolean;
        allowUnits?: boolean;
      }) => {
        if (!allowCourseCodes && condition.courseCodes.length > 0) {
          unexpected(
            "courseCodes",
            `must be empty for ${condition.conditionKind}`,
          );
        }
        if (
          !allowStructureCodes &&
          (condition.structureKind !== null ||
            condition.structureCodes.length > 0)
        ) {
          unexpected(
            "structureCodes",
            `must be empty for ${condition.conditionKind}`,
          );
        }
        if (!allowSubject && condition.subjectCode !== null) {
          unexpected(
            "subjectCode",
            `must be null for ${condition.conditionKind}`,
          );
        }
        if (
          !allowLevels &&
          (condition.minimumLevel !== null || condition.maximumLevel !== null)
        ) {
          unexpected(
            "minimumLevel",
            `levels must be null for ${condition.conditionKind}`,
          );
        }
        if (!allowTag && condition.tag !== null) {
          unexpected("tag", `must be null for ${condition.conditionKind}`);
        }
        if (!allowFreeText && condition.freeText !== null) {
          unexpected("freeText", `must be null for ${condition.conditionKind}`);
        }
        if (!allowMinimumCourses && condition.minimumCourses !== null) {
          unexpected(
            "minimumCourses",
            `must be null for ${condition.conditionKind}`,
          );
        }
        if (!allowUnits && hasUnits) {
          unexpected(
            "minimumUnits",
            `units must be null for ${condition.conditionKind}`,
          );
        }
      };

      if (
        condition.minimumUnits !== null &&
        condition.maximumUnits !== null &&
        condition.minimumUnits > condition.maximumUnits
      ) {
        context.addIssue({
          code: "custom",
          path: ["maximumUnits"],
          message: "must not be less than minimumUnits",
        });
      }
      if (
        condition.minimumLevel !== null &&
        condition.maximumLevel !== null &&
        condition.minimumLevel > condition.maximumLevel
      ) {
        context.addIssue({
          code: "custom",
          path: ["maximumLevel"],
          message: "must not be less than minimumLevel",
        });
      }
      if (
        condition.conditionKind === "course_list" &&
        condition.courseCodes.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["courseCodes"],
          message: "must contain a literal course code",
        });
      }
      if (condition.conditionKind === "consecutive_semester_pair") {
        if (
          condition.courseCodes.length !== 2 ||
          condition.courseCodes[0] === condition.courseCodes[1]
        )
          unexpected(
            "courseCodes",
            "must contain two distinct courses in order",
          );
        if (
          condition.minimumUnits === null ||
          (condition.maximumUnits !== null &&
            condition.maximumUnits !== condition.minimumUnits)
        )
          unexpected("minimumUnits", "requires an exact unit amount");
        if (!condition.freeText?.trim())
          unexpected("freeText", "requires the exact semester timing wording");
      }
      if (
        condition.conditionKind === "structure_list" &&
        (condition.structureKind === null ||
          condition.structureCodes.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          path: ["structureCodes"],
          message: "must contain a kind and literal structure code",
        });
      }
      if (
        condition.conditionKind === "subject" &&
        condition.subjectCode === null
      ) {
        context.addIssue({
          code: "custom",
          path: ["subjectCode"],
          message: "is required for a subject condition",
        });
      }
      if (condition.conditionKind === "tag" && condition.tag === null) {
        context.addIssue({
          code: "custom",
          path: ["tag"],
          message: "is required for a tag condition",
        });
      }
      if (
        condition.conditionKind === "free_text" &&
        condition.freeText === null
      ) {
        context.addIssue({
          code: "custom",
          path: ["freeText"],
          message: "is required for a free-text condition",
        });
      }

      switch (condition.conditionKind) {
        case "course_list":
          disallowCommonReferences({
            allowCourseCodes: true,
            allowMinimumCourses: true,
            allowUnits: true,
          });
          break;
        case "consecutive_semester_pair":
          disallowCommonReferences({
            allowCourseCodes: true,
            allowFreeText: true,
            allowUnits: true,
          });
          break;
        case "structure_list":
          disallowCommonReferences({
            allowStructureCodes: true,
            allowMinimumCourses: true,
            allowUnits: true,
          });
          break;
        case "unit_total":
          disallowCommonReferences({ allowUnits: true });
          if (!hasUnits) {
            unexpected(
              "minimumUnits",
              "unit_total requires minimumUnits or maximumUnits",
            );
          }
          break;
        case "level":
          disallowCommonReferences({ allowLevels: true, allowUnits: true });
          if (
            condition.minimumLevel === null &&
            condition.maximumLevel === null
          ) {
            unexpected(
              "minimumLevel",
              "level requires minimumLevel or maximumLevel",
            );
          }
          break;
        case "subject":
          disallowCommonReferences({
            allowSubject: true,
            allowLevels: true,
            allowUnits: true,
          });
          break;
        case "tag":
          disallowCommonReferences({ allowTag: true, allowUnits: true });
          break;
        case "unrestricted":
          disallowCommonReferences({ allowUnits: true });
          if (!hasUnits) {
            unexpected(
              "minimumUnits",
              "unrestricted requires minimumUnits or maximumUnits",
            );
          }
          break;
        case "free_text":
          disallowCommonReferences({
            allowFreeText: true,
            allowLevels: true,
            allowUnits: true,
          });
          break;
      }
    });

const requirementRuleSchema: z.ZodType<AcademicStructureRequirementRule> =
  z.lazy(() =>
    z.union([
      z
        .object({
          type: z.literal("group"),
          key: nonEmptyString,
          operator: z.enum(["all_of", "any_of", "minimum_count"]),
          minimumCount: z.number().int().positive().nullable().default(null),
          scope: z.enum(["part", "degree"]).default("part"),
          title: nullableString,
          sourceText: nonEmptyString,
          sourceLocator: nonEmptyString,
          children: z.array(requirementRuleSchema).min(1),
        })
        .strict()
        .superRefine((group, context) => {
          if (
            (group.operator === "minimum_count") !==
            (group.minimumCount !== null)
          ) {
            context.addIssue({
              code: "custom",
              path: ["minimumCount"],
              message:
                "must be present only when the operator is minimum_count",
            });
          }
          if (
            group.minimumCount !== null &&
            group.minimumCount > group.children.length
          ) {
            context.addIssue({
              code: "custom",
              path: ["minimumCount"],
              message: "must not exceed the number of children",
            });
          }
        }),
      requirementConditionSchema,
    ]),
  );

const requirementsSchema = z
  .object({
    sourceText: nullableString,
    sourceLocator: nullableString,
    rule: requirementRuleSchema.nullable().default(null),
    unmodelledText: z.array(nonEmptyString),
  })
  .strict()
  .superRefine((requirements, context) => {
    if (
      (requirements.sourceText === null) !==
      (requirements.sourceLocator === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceLocator"],
        message: "must be present whenever sourceText is present",
      });
    }
    if (requirements.rule !== null && requirements.sourceText === null) {
      context.addIssue({
        code: "custom",
        path: ["rule"],
        message: "requires sourceText",
      });
    }
    if (requirements.rule?.type === "condition") {
      context.addIssue({
        code: "custom",
        path: ["rule"],
        message: "must use a group as the root of the requirement tree",
      });
    }
  });

const evidenceSchema = z
  .object({
    fieldKey: nonEmptyString,
    sourceLocator: nonEmptyString,
    evidenceExcerpt: nonEmptyString,
    confidence: z.number().finite().min(0).max(1),
    method: z.literal("model"),
  })
  .strict();

const reviewItemSchema = z
  .object({
    fieldKey: nonEmptyString,
    kind: z.enum([
      "missing",
      "ambiguous",
      "conflict",
      "unsupported",
      "invalid",
      "model_repair",
      "evidence_missing",
    ]),
    severity: z.enum(["warning", "error"]),
    message: nonEmptyString,
  })
  .strict();

const academicStructureExtractionSchema: z.ZodType<AcademicStructureExtraction> =
  z
    .object({
      schemaVersion: z.literal(ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION),
      kind: structureKindSchema,
      code: nonEmptyString.regex(ACADEMIC_STRUCTURE_CODE_PATTERN),
      year: z.number().int().min(2020).max(2030),
      title: nonEmptyString,
      acronym: nullableString,
      shortName: nullableString,
      introduction: nullableString,
      description: nullableString,
      totalUnits: nullableUnits,
      durationYears: z.number().finite().positive().nullable().default(null),
      academicCareer: nullableString,
      college: nullableString,
      deliveryMode: nullableString,
      selectionRank: nullableUnits,
      atar: nullableUnits,
      canCombine: z.boolean().nullable().default(null),
      canCombineVertical: z.boolean().nullable().default(null),
      studyAs: nullableString,
      contactText: nullableString,
      summaryFields: z.array(summaryFieldSchema),
      sections: z.array(sectionSchema),
      learningOutcomes: z.array(learningOutcomeSchema),
      fees: z.array(feeSchema),
      relationships: z.array(relationshipSchema),
      requirements: requirementsSchema,
      evidence: z.array(evidenceSchema),
      overallConfidence: z
        .number()
        .finite()
        .min(0)
        .max(1)
        .nullable()
        .default(null),
      reviewItems: z.array(reviewItemSchema),
    })
    .strict();

function codeMatchesKind(kind: AcademicStructureKind, code: string) {
  if (kind === "major") return code.endsWith("-MAJ");
  if (kind === "minor") return code.endsWith("-MIN");
  if (kind === "specialisation") return /-(?:HSPC|SPEC)$/.test(code);
  return !/-(?:HSPC|MAJ|MIN|SPEC)$/.test(code);
}

export function normaliseAcademicStructureCode(code: string) {
  const normalised = code.trim().toUpperCase();
  if (!ACADEMIC_STRUCTURE_CODE_PATTERN.test(normalised)) {
    throw new TypeError(`Invalid ANU academic structure code: ${code}`);
  }
  return normalised;
}

export function validateAcademicStructureExtraction(
  value: unknown,
  options: AcademicStructureExtractionValidationOptions = {},
): AcademicStructureExtractionValidationResult {
  const result = academicStructureExtractionSchema.safeParse(value);
  const issues: AcademicStructureExtractionValidationIssue[] = result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: `$.${issue.path.join(".")}`,
        message: issue.message,
      }));

  if (!result.success) return { success: false, issues };

  const extraction = result.data;
  if (!codeMatchesKind(extraction.kind, extraction.code)) {
    issues.push({
      path: "$.code",
      message: `does not match the ${extraction.kind} code convention`,
    });
  }
  if (options.expectedKind && extraction.kind !== options.expectedKind) {
    issues.push({
      path: "$.kind",
      message: `must match the selected kind ${options.expectedKind}`,
    });
  }
  if (
    options.expectedCode &&
    extraction.code !== normaliseAcademicStructureCode(options.expectedCode)
  ) {
    issues.push({
      path: "$.code",
      message: `must match the selected code ${normaliseAcademicStructureCode(options.expectedCode)}`,
    });
  }
  if (options.expectedYear && extraction.year !== options.expectedYear) {
    issues.push({
      path: "$.year",
      message: `must match the selected year ${options.expectedYear}`,
    });
  }
  for (const [index, relationship] of extraction.relationships.entries()) {
    if (!codeMatchesKind(relationship.targetKind, relationship.targetCode)) {
      issues.push({
        path: `$.relationships.${index}.targetCode`,
        message: `does not match target kind ${relationship.targetKind}`,
      });
    }
    // Structures are offered in degrees, and a degree's options are the
    // majors, minors and specialisations studied within it.
    const expectsProgramme = relationship.relationshipKind === "offered_in";
    const expectsComponent = relationship.relationshipKind === "option";
    if (
      (expectsProgramme && relationship.targetKind !== "programme") ||
      (expectsComponent && relationship.targetKind === "programme")
    ) {
      issues.push({
        path: `$.relationships.${index}.targetKind`,
        message: `cannot be ${relationship.targetKind} for ${relationship.relationshipKind}`,
      });
    }
  }
  const seenSections = new Set<string>();
  for (const [index, section] of extraction.sections.entries()) {
    if (seenSections.has(section.key)) {
      issues.push({
        path: `$.sections.${index}.key`,
        message: "must appear once; merge the wording into one section",
      });
    }
    seenSections.add(section.key);
  }

  return issues.length === 0
    ? { success: true, data: extraction, issues: [] }
    : { success: false, issues };
}

export function parseAcademicStructureExtraction(
  value: unknown,
  options: AcademicStructureExtractionValidationOptions = {},
) {
  const result = validateAcademicStructureExtraction(value, options);
  if (!result.success) {
    const detail = result.issues
      .slice(0, 10)
      .map(({ path, message }) => `${path} ${message}`)
      .join("; ");
    throw new TypeError(`Invalid academic structure extraction: ${detail}`);
  }
  return result.data;
}
