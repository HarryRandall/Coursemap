import { z } from "zod";

export const ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION =
  "academic-structure-extraction.v3" as const;

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

export type AcademicStructureSection = {
  position: number;
  key: string;
  heading: string;
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
  relationshipKind:
    | "source_reference"
    | "relevant"
    | "option"
    | "required"
    | "incompatible"
    | "other";
  targetKind: AcademicStructureKind | "course";
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
  title: string | null;
  sourceText: string;
  sourceLocator: string;
  children: AcademicStructureRequirementRule[];
};

export type AcademicStructureRequirementCondition = {
  type: "condition";
  key: string;
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
  courseCodes: string[];
  structureKind: AcademicStructureKind | null;
  structureCodes: string[];
  subjectCode: string | null;
  minimumLevel: number | null;
  maximumLevel: number | null;
  tag: string | null;
  freeText: string | null;
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
  method: "deterministic" | "model";
};

export type AcademicStructureExtractionReviewItem = {
  fieldKey: string;
  kind:
    | "missing"
    | "ambiguous"
    | "conflict"
    | "unsupported"
    | "invalid"
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
  evidenceMethod?: AcademicStructureExtractionEvidence["method"];
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
const nullableString = nonEmptyString.nullable();
const position = z.number().int().positive();
const nullableUnits = z.number().finite().nonnegative().nullable();
const nullableRequirementUnits = z.number().finite().positive().nullable();
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
    position,
    key: nonEmptyString.regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
    heading: nonEmptyString,
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
    feeYear: z.number().int().min(2000).max(2200).nullable(),
    audience: z.enum([
      "domestic",
      "international",
      "commonwealth_supported",
      "other",
    ]),
    feeType: z.enum(["student_contribution", "tuition", "indicative", "other"]),
    amount: nullableUnits,
    currency: z.literal("AUD").nullable(),
    basis: z.enum(["programme", "unit", "eftsl", "annual", "unknown"]),
    sourceLabel: nullableString,
    sourceText: nonEmptyString,
    sourceLocator: nonEmptyString,
  })
  .strict();

const relationshipSchema = z
  .object({
    position,
    relationshipKind: z.enum([
      "source_reference",
      "relevant",
      "option",
      "required",
      "incompatible",
      "other",
    ]),
    targetKind: z.union([structureKindSchema, z.literal("course")]),
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
      minimumCourses: z.number().int().positive().nullable(),
      courseCodes: z.array(nonEmptyString.regex(COURSE_CODE_PATTERN)),
      structureKind: structureKindSchema.nullable(),
      structureCodes: z.array(
        nonEmptyString.regex(ACADEMIC_STRUCTURE_CODE_PATTERN),
      ),
      subjectCode: nonEmptyString.regex(/^[A-Z]{4}$/).nullable(),
      minimumLevel: z.number().int().min(0).max(9999).nullable(),
      maximumLevel: z.number().int().min(0).max(9999).nullable(),
      tag: nullableString,
      freeText: nullableString,
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
          disallowCommonReferences({ allowFreeText: true });
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
          minimumCount: z.number().int().positive().nullable(),
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
    rule: requirementRuleSchema.nullable(),
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
    method: z.enum(["deterministic", "model"]),
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
      durationYears: z.number().finite().positive().nullable(),
      academicCareer: nullableString,
      college: nullableString,
      deliveryMode: nullableString,
      selectionRank: nullableUnits,
      atar: nullableUnits,
      canCombine: z.boolean().nullable(),
      canCombineVertical: z.boolean().nullable(),
      studyAs: nullableString,
      contactText: nullableString,
      summaryFields: z.array(summaryFieldSchema),
      sections: z.array(sectionSchema),
      learningOutcomes: z.array(learningOutcomeSchema),
      fees: z.array(feeSchema),
      relationships: z.array(relationshipSchema),
      requirements: requirementsSchema,
      evidence: z.array(evidenceSchema),
      overallConfidence: z.number().finite().min(0).max(1).nullable(),
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
  if (
    options.evidenceMethod &&
    extraction.evidence.some(({ method }) => method !== options.evidenceMethod)
  ) {
    issues.push({
      path: "$.evidence",
      message: `must contain only ${options.evidenceMethod} evidence`,
    });
  }
  for (const [index, relationship] of extraction.relationships.entries()) {
    const targetMatches =
      relationship.targetKind === "course"
        ? COURSE_CODE_PATTERN.test(relationship.targetCode)
        : codeMatchesKind(relationship.targetKind, relationship.targetCode);
    if (!targetMatches) {
      issues.push({
        path: `$.relationships.${index}.targetCode`,
        message: `does not match target kind ${relationship.targetKind}`,
      });
    }
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

const nullableNumberSchema = { type: ["number", "null"], minimum: 0 };
const nullableStringSchema = { type: ["string", "null"] };

// OpenRouter receives this schema alongside the trusted prompt. Runtime
// validation above remains authoritative for cross-field and selected-target
// checks that JSON Schema cannot express clearly.
export const ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "kind",
    "code",
    "year",
    "title",
    "acronym",
    "shortName",
    "introduction",
    "description",
    "totalUnits",
    "durationYears",
    "academicCareer",
    "college",
    "deliveryMode",
    "selectionRank",
    "atar",
    "canCombine",
    "canCombineVertical",
    "studyAs",
    "contactText",
    "summaryFields",
    "sections",
    "learningOutcomes",
    "fees",
    "relationships",
    "requirements",
    "evidence",
    "overallConfidence",
    "reviewItems",
  ],
  properties: {
    schemaVersion: { const: ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION },
    kind: { enum: ACADEMIC_STRUCTURE_KINDS },
    code: { type: "string", pattern: "^[A-Z0-9][A-Z0-9-]{1,31}$" },
    year: { type: "integer", minimum: 2020, maximum: 2030 },
    title: { type: "string", minLength: 1 },
    acronym: nullableStringSchema,
    shortName: nullableStringSchema,
    introduction: nullableStringSchema,
    description: nullableStringSchema,
    totalUnits: nullableNumberSchema,
    durationYears: {
      type: ["number", "null"],
      exclusiveMinimum: 0,
    },
    academicCareer: nullableStringSchema,
    college: nullableStringSchema,
    deliveryMode: nullableStringSchema,
    selectionRank: nullableNumberSchema,
    atar: nullableNumberSchema,
    canCombine: { type: ["boolean", "null"] },
    canCombineVertical: { type: ["boolean", "null"] },
    studyAs: nullableStringSchema,
    contactText: nullableStringSchema,
    summaryFields: {
      type: "array",
      items: { $ref: "#/$defs/summaryField" },
    },
    sections: { type: "array", items: { $ref: "#/$defs/section" } },
    learningOutcomes: {
      type: "array",
      items: { $ref: "#/$defs/learningOutcome" },
    },
    fees: { type: "array", items: { $ref: "#/$defs/fee" } },
    relationships: {
      type: "array",
      items: { $ref: "#/$defs/relationship" },
    },
    requirements: { $ref: "#/$defs/requirements" },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
    overallConfidence: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 1,
    },
    reviewItems: {
      type: "array",
      items: { $ref: "#/$defs/reviewItem" },
    },
  },
  $defs: {
    nullableString: nullableStringSchema,
    summaryField: {
      type: "object",
      additionalProperties: false,
      required: ["position", "key", "label", "values", "sourceText"],
      properties: {
        position: { type: "integer", minimum: 1 },
        key: {
          type: "string",
          pattern: "^[a-z0-9]+(?:_[a-z0-9]+)*$",
        },
        label: { type: "string", minLength: 1 },
        values: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        sourceText: { type: "string", minLength: 1 },
      },
    },
    section: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "key",
        "heading",
        "markdown",
        "sourceText",
        "sourceLocator",
      ],
      properties: {
        position: { type: "integer", minimum: 1 },
        key: {
          type: "string",
          pattern: "^[a-z0-9]+(?:[-_][a-z0-9]+)*$",
        },
        heading: { type: "string", minLength: 1 },
        markdown: { type: "string", minLength: 1 },
        sourceText: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
      },
    },
    learningOutcome: {
      type: "object",
      additionalProperties: false,
      required: ["position", "text", "sourceText", "sourceLocator"],
      properties: {
        position: { type: "integer", minimum: 1 },
        text: { type: "string", minLength: 1 },
        sourceText: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
      },
    },
    fee: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "feeYear",
        "audience",
        "feeType",
        "amount",
        "currency",
        "basis",
        "sourceLabel",
        "sourceText",
        "sourceLocator",
      ],
      properties: {
        position: { type: "integer", minimum: 1 },
        feeYear: { type: ["integer", "null"], minimum: 2000, maximum: 2200 },
        audience: {
          enum: [
            "domestic",
            "international",
            "commonwealth_supported",
            "other",
          ],
        },
        feeType: {
          enum: ["student_contribution", "tuition", "indicative", "other"],
        },
        amount: nullableNumberSchema,
        currency: { enum: ["AUD", null] },
        basis: {
          enum: ["programme", "unit", "eftsl", "annual", "unknown"],
        },
        sourceLabel: nullableStringSchema,
        sourceText: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
      },
    },
    relationship: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "relationshipKind",
        "targetKind",
        "targetCode",
        "targetTitle",
        "sourceText",
        "sourceLocator",
      ],
      properties: {
        position: { type: "integer", minimum: 1 },
        relationshipKind: {
          enum: [
            "source_reference",
            "relevant",
            "option",
            "required",
            "incompatible",
            "other",
          ],
        },
        targetKind: { enum: [...ACADEMIC_STRUCTURE_KINDS, "course"] },
        targetCode: { type: "string", minLength: 1 },
        targetTitle: nullableStringSchema,
        sourceText: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
      },
    },
    requirementRule: {
      oneOf: [
        { $ref: "#/$defs/requirementGroup" },
        { $ref: "#/$defs/requirementCondition" },
      ],
    },
    requirementGroup: {
      type: "object",
      additionalProperties: false,
      required: [
        "type",
        "key",
        "operator",
        "minimumCount",
        "title",
        "sourceText",
        "sourceLocator",
        "children",
      ],
      properties: {
        type: { const: "group" },
        key: { type: "string", minLength: 1 },
        operator: { enum: ["all_of", "any_of", "minimum_count"] },
        minimumCount: { type: ["integer", "null"], minimum: 1 },
        title: nullableStringSchema,
        sourceText: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
        children: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/requirementRule" },
        },
      },
    },
    requirementCondition: {
      type: "object",
      additionalProperties: false,
      required: [
        "type",
        "key",
        "conditionKind",
        "minimumUnits",
        "maximumUnits",
        "minimumCourses",
        "courseCodes",
        "structureKind",
        "structureCodes",
        "subjectCode",
        "minimumLevel",
        "maximumLevel",
        "tag",
        "freeText",
        "sourceText",
        "sourceLocator",
      ],
      properties: {
        type: { const: "condition" },
        key: { type: "string", minLength: 1 },
        conditionKind: {
          enum: [
            "course_list",
            "structure_list",
            "unit_total",
            "level",
            "subject",
            "tag",
            "unrestricted",
            "free_text",
          ],
        },
        minimumUnits: nullableNumberSchema,
        maximumUnits: nullableNumberSchema,
        minimumCourses: { type: ["integer", "null"], minimum: 1 },
        courseCodes: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$",
          },
        },
        structureKind: { enum: [...ACADEMIC_STRUCTURE_KINDS, null] },
        structureCodes: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z0-9][A-Z0-9-]{1,31}$",
          },
        },
        subjectCode: {
          type: ["string", "null"],
          pattern: "^[A-Z]{4}$",
        },
        minimumLevel: { type: ["integer", "null"], minimum: 0 },
        maximumLevel: { type: ["integer", "null"], minimum: 0 },
        tag: nullableStringSchema,
        freeText: nullableStringSchema,
        sourceText: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
      },
    },
    requirements: {
      type: "object",
      additionalProperties: false,
      required: ["sourceText", "sourceLocator", "rule", "unmodelledText"],
      properties: {
        sourceText: nullableStringSchema,
        sourceLocator: nullableStringSchema,
        rule: {
          anyOf: [{ $ref: "#/$defs/requirementRule" }, { type: "null" }],
        },
        unmodelledText: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "fieldKey",
        "sourceLocator",
        "evidenceExcerpt",
        "confidence",
        "method",
      ],
      properties: {
        fieldKey: { type: "string", minLength: 1 },
        sourceLocator: { type: "string", minLength: 1 },
        evidenceExcerpt: { type: "string", minLength: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        method: { const: "model" },
      },
    },
    reviewItem: {
      type: "object",
      additionalProperties: false,
      required: ["fieldKey", "kind", "severity", "message"],
      properties: {
        fieldKey: { type: "string", minLength: 1 },
        kind: {
          enum: [
            "missing",
            "ambiguous",
            "conflict",
            "unsupported",
            "invalid",
            "evidence_missing",
          ],
        },
        severity: { enum: ["warning", "error"] },
        message: { type: "string", minLength: 1 },
      },
    },
  },
} as const;
