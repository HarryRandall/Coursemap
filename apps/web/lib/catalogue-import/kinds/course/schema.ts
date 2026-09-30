import { ENROLMENT_MODES } from "../../../academic/enrolment-mode.ts";
import { COURSE_LEVELS } from "../../../academic/course-level.ts";
import { COURSE_EXTRACTION_SCHEMA_VERSION } from "./contract.ts";

// OpenRouter receives this in the system message while JSON object mode keeps
// Gemini from rejecting the complete, deeply nested schema at the provider
// boundary. The runtime validator in contract.ts remains authoritative and adds the
// semantic checks JSON Schema cannot express, including selected-year offerings.
export const COURSE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "code",
    "year",
    "title",
    "unitValue",
    "eftsl",
    "level",
    "subjectCode",
    "subjectName",
    "school",
    "college",
    "academicCareer",
    "convenerText",
    "deliverySummary",
    "introduction",
    "description",
    "workloadText",
    "workloadHours",
    "inherentRequirements",
    "prescribedTexts",
    "offeringStatus",
    "sourceUpdatedAt",
    "areasOfInterest",
    "tags",
    "fees",
    "learningOutcomes",
    "assessmentItems",
    "offerings",
    "requisites",
    "relatedCourses",
    "attributes",
    "evidence",
    "overallConfidence",
    "reviewItems",
  ],
  properties: {
    schemaVersion: { const: COURSE_EXTRACTION_SCHEMA_VERSION },
    code: { type: "string", pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$" },
    year: { type: "integer", minimum: 2000, maximum: 2200 },
    title: { type: "string", minLength: 1 },
    unitValue: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "units"],
          properties: {
            kind: { const: "fixed" },
            units: { type: "number", minimum: 0 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "minimumUnits", "maximumUnits"],
          properties: {
            kind: { const: "range" },
            minimumUnits: { type: "number", minimum: 0 },
            maximumUnits: { type: "number", minimum: 0 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "unitsOptions"],
          properties: {
            kind: { const: "variable" },
            unitsOptions: {
              type: "array",
              minItems: 2,
              items: { type: "number", minimum: 0 },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: { kind: { const: "unknown" } },
        },
      ],
    },
    eftsl: { type: ["number", "null"], minimum: 0 },
    level: { type: "integer", enum: [...COURSE_LEVELS] },
    subjectCode: { type: "string", pattern: "^[A-Z]{4}$" },
    subjectName: { type: ["string", "null"] },
    school: { type: ["string", "null"] },
    college: { type: ["string", "null"] },
    academicCareer: { enum: ["UGRD", "PGRD", "RSCH", "OTHER", null] },
    convenerText: { type: ["string", "null"] },
    deliverySummary: { type: ["string", "null"] },
    introduction: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    workloadText: { type: ["string", "null"] },
    workloadHours: { type: ["number", "null"], minimum: 0 },
    workloadHoursBasis: { enum: ["weekly", "total", null] },
    inherentRequirements: { type: ["string", "null"] },
    prescribedTexts: { type: ["string", "null"] },
    offeringStatus: { enum: ["offered", "not_offered", "unknown"] },
    sourceUpdatedAt: { $ref: "#/$defs/nullableInstant" },
    areasOfInterest: { type: "array", items: { type: "string", minLength: 1 } },
    tags: { type: "array", items: { type: "string", minLength: 1 } },
    fees: { type: "array", items: { $ref: "#/$defs/fee" } },
    learningOutcomes: { type: "array", items: { $ref: "#/$defs/outcome" } },
    assessmentItems: { type: "array", items: { $ref: "#/$defs/assessment" } },
    offerings: { type: "array", items: { $ref: "#/$defs/offering" } },
    requisites: { $ref: "#/$defs/requisites" },
    relatedCourses: { type: "array", items: { $ref: "#/$defs/relatedCourse" } },
    attributes: { type: "array", items: { $ref: "#/$defs/attribute" } },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
    overallConfidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    reviewItems: { type: "array", items: { $ref: "#/$defs/reviewItem" } },
  },
  $defs: {
    nullableString: { type: ["string", "null"] },
    nullableDate: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    nullableInstant: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$",
    },
    nullableAnuClassSummaryUrl: {
      type: ["string", "null"],
      pattern:
        "^https://programsandcourses\\.anu\\.edu\\.au/(?:[0-9]{4}/)?course/[A-Z]{4}[0-9]{4}[A-Z]?/[^/]+/[0-9]+/?(?:[?#].*)?$",
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
        "studentContributionBand",
        "sourceLabel",
        "sourceText",
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
        amount: { type: ["number", "null"], minimum: 0 },
        currency: { type: ["string", "null"], pattern: "^[A-Z]{3}$" },
        basis: { enum: ["course", "unit", "eftsl", "annual", "unknown"] },
        studentContributionBand: { type: ["integer", "null"], minimum: 1 },
        sourceLabel: { $ref: "#/$defs/nullableString" },
        sourceText: { type: "string", minLength: 1 },
      },
    },
    outcome: {
      type: "object",
      additionalProperties: false,
      required: ["position", "text"],
      properties: {
        position: { type: "integer", minimum: 1 },
        text: { type: "string", minLength: 1 },
      },
    },
    assessment: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "title",
        "weight",
        "hurdle",
        "dueText",
        "sourceText",
        "learningOutcomePositions",
      ],
      properties: {
        position: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1 },
        weight: { type: ["number", "null"], minimum: 0, maximum: 100 },
        hurdle: { type: ["boolean", "null"] },
        dueText: { $ref: "#/$defs/nullableString" },
        sourceText: { type: "string", minLength: 1 },
        learningOutcomePositions: {
          type: "array",
          items: { type: "integer", minimum: 1 },
        },
      },
    },
    offering: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "calendarYear",
        "periodCode",
        "periodName",
        "classNumber",
        "startsOn",
        "endsOn",
        "lastEnrolmentDate",
        "censusDate",
        "deliveryMode",
        "location",
        "classSummaryUrl",
        "sourceText",
      ],
      properties: {
        position: { type: "integer", minimum: 1 },
        calendarYear: { type: "integer", minimum: 2000, maximum: 2200 },
        periodCode: { type: "string", minLength: 1 },
        periodName: { type: "string", minLength: 1 },
        classNumber: { $ref: "#/$defs/nullableString" },
        startsOn: { $ref: "#/$defs/nullableDate" },
        endsOn: { $ref: "#/$defs/nullableDate" },
        lastEnrolmentDate: { $ref: "#/$defs/nullableDate" },
        censusDate: { $ref: "#/$defs/nullableDate" },
        deliveryMode: { $ref: "#/$defs/nullableString" },
        location: { $ref: "#/$defs/nullableString" },
        classSummaryUrl: { $ref: "#/$defs/nullableAnuClassSummaryUrl" },
        sourceText: { type: "string", minLength: 1 },
      },
    },
    rule: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "courseCode"],
          properties: {
            op: { enum: ["completed", "completed_or_concurrent"] },
            minimumMark: { type: ["number", "null"], minimum: 0, maximum: 100 },
            courseCode: {
              type: "string",
              pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$",
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "rules"],
          properties: {
            op: { enum: ["all_of", "one_of"] },
            rules: {
              type: "array",
              minItems: 2,
              items: { $ref: "#/$defs/rule" },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits"],
          properties: {
            op: { const: "min_units_total" },
            minimumUnits: { type: "number", exclusiveMinimum: 0 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits", "level"],
          properties: {
            op: { const: "min_units_at_level" },
            minimumUnits: { type: "number", exclusiveMinimum: 0 },
            level: { type: "integer", minimum: 0, maximum: 9999 },
            maximumLevel: {
              type: ["integer", "null"],
              minimum: 0,
              maximum: 9999,
            },
            subjectCode: { type: ["string", "null"], pattern: "^[A-Z]{4}$" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits", "subjectCode"],
          properties: {
            op: { const: "min_units_from_subject" },
            minimumUnits: { type: "number", exclusiveMinimum: 0 },
            subjectCode: { type: "string", pattern: "^[A-Z]{4}$" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumCount", "subjectCode"],
          properties: {
            op: { const: "min_courses_from_subject" },
            minimumCount: { type: "integer", minimum: 1, maximum: 32767 },
            subjectCode: { type: "string", pattern: "^[A-Z]{4}$" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits", "courseCodes"],
          properties: {
            op: { const: "min_units_from_courses" },
            minimumUnits: { type: "number", exclusiveMinimum: 0 },
            courseCodes: {
              type: "array",
              items: {
                type: "string",
                pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$",
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "programmeCode"],
          properties: {
            op: { const: "enrolled_in" },
            programmeCode: { type: "string", pattern: "^[A-Z0-9-]{3,20}$" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "college"],
          properties: {
            op: { const: "enrolled_in_college" },
            college: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "sourceText"],
          properties: {
            op: { const: "equivalent_course" },
            sourceText: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "mode", "matches"],
          properties: {
            op: { const: "enrolment_mode" },
            mode: { type: "string", enum: ENROLMENT_MODES },
            matches: { type: "boolean" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumYear", "maximumYear"],
          properties: {
            op: { const: "commencement_year" },
            minimumYear: {
              type: ["integer", "null"],
              minimum: 1900,
              maximum: 9999,
            },
            maximumYear: {
              type: ["integer", "null"],
              minimum: 1900,
              maximum: 9999,
            },
          },
          anyOf: [
            { properties: { minimumYear: { type: "integer" } } },
            { properties: { maximumYear: { type: "integer" } } },
          ],
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumYear"],
          properties: {
            op: { const: "year_standing" },
            minimumYear: { type: "integer", minimum: 1, maximum: 10 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "value", "scale"],
          properties: {
            op: { const: "minimum_gpa" },
            value: { type: "number", minimum: 0, maximum: 100 },
            scale: { enum: ["anu7", "wam100"] },
            recentGradedUnits: {
              type: ["integer", "null"],
              minimum: 1,
              maximum: 300,
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op"],
          properties: {
            op: { const: "permission" },
            sourceText: { type: ["string", "null"], minLength: 1 },
          },
        },
      ],
    },
    incompatibilityRule: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "courseCode"],
          properties: {
            op: { enum: ["not_completed", "not_concurrent"] },
            courseCode: { type: "string", pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "sourceText"],
          properties: {
            op: { const: "permission" },
            sourceText: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "rules"],
          properties: {
            op: { enum: ["all_of", "one_of"] },
            rules: {
              type: "array",
              minItems: 2,
              items: { $ref: "#/$defs/incompatibilityRule" },
            },
          },
        },
      ],
    },
    requisites: {
      type: "object",
      additionalProperties: false,
      required: [
        "assumedKnowledgeText",
        "prerequisiteText",
        "corequisiteText",
        "incompatibilityText",
        "prerequisiteRule",
        "corequisiteRule",
        "incompatibilityCourseCodes",
        "softIncompatibilityCourseCodes",
        "concurrentIncompatibilityCourseCodes",
        "softConcurrentIncompatibilityCourseCodes",
        "unmodelledText",
      ],
      properties: {
        assumedKnowledgeText: { $ref: "#/$defs/nullableString" },
        prerequisiteText: { $ref: "#/$defs/nullableString" },
        corequisiteText: { $ref: "#/$defs/nullableString" },
        incompatibilityText: { $ref: "#/$defs/nullableString" },
        prerequisiteRule: {
          anyOf: [{ $ref: "#/$defs/rule" }, { type: "null" }],
        },
        corequisiteRule: {
          anyOf: [{ $ref: "#/$defs/rule" }, { type: "null" }],
        },
        incompatibilityRule: {
          anyOf: [{ $ref: "#/$defs/incompatibilityRule" }, { type: "null" }],
        },
        incompatibilityCourseCodes: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$",
          },
        },
        softIncompatibilityCourseCodes: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$",
          },
        },
        concurrentIncompatibilityCourseCodes: {
          type: "array",
          items: { type: "string", pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$" },
        },
        softConcurrentIncompatibilityCourseCodes: {
          type: "array",
          items: { type: "string", pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$" },
        },
        unmodelledText: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    relatedCourse: {
      type: "object",
      additionalProperties: false,
      required: [
        "position",
        "relationKind",
        "courseCode",
        "courseTitle",
        "sourceText",
      ],
      properties: {
        position: { type: "integer", minimum: 1 },
        relationKind: { enum: ["co_taught", "equivalent", "other"] },
        courseCode: {
          type: "string",
          pattern: "^[A-Z]{4}[0-9]{4}[A-Z]?$",
        },
        courseTitle: { $ref: "#/$defs/nullableString" },
        sourceText: { type: "string", minLength: 1 },
      },
    },
    attribute: {
      type: "object",
      additionalProperties: false,
      required: ["position", "attributeKind", "value", "sourceText"],
      properties: {
        position: { type: "integer", minimum: 1 },
        attributeKind: { enum: ["graduate_attribute", "stem", "other"] },
        value: { type: "string", minLength: 1 },
        sourceText: { type: "string", minLength: 1 },
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
        method: { enum: ["model"] },
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
