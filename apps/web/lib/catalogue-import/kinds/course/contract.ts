import type { EnrolmentMode } from "../../../academic/enrolment-mode.ts";
import {
  WORKLOAD_HOURS_BASES,
  type WorkloadHoursBasis,
} from "../../../academic/workload.ts";
import { courseLevelForCode } from "../../../academic/course-code.ts";
import {
  type UnknownRecord,
  COURSE_CODE_PATTERN,
  cleanText,
  exactRecord,
  requireArray,
  requireBoolean,
  requireEnum,
  requireNumber,
  requireString,
} from "./validation-helpers.ts";
import { validateCourseRequisites } from "./requisite-validation.ts";
import { validateCourseOfferings } from "./offering-validation.ts";

export { COURSE_CODE_PATTERN } from "./validation-helpers.ts";
export { normaliseAnuClassSummaryUrl } from "./offering-validation.ts";

export const COURSE_EXTRACTION_SCHEMA_VERSION = "course-extraction.v2" as const;

export type CourseUnitValue =
  | { kind: "fixed"; units: number }
  | { kind: "range"; minimumUnits: number; maximumUnits: number }
  | { kind: "variable"; unitsOptions: number[] }
  | { kind: "unknown" };

export type CourseFee = {
  position: number;
  feeYear: number | null;
  audience: "domestic" | "international" | "commonwealth_supported" | "other";
  feeType: "student_contribution" | "tuition" | "indicative" | "other";
  amount: number | null;
  currency: string | null;
  basis: "course" | "unit" | "eftsl" | "annual" | "unknown";
  studentContributionBand: number | null;
  sourceLabel: string | null;
  sourceText: string;
};

export type CourseLearningOutcome = {
  position: number;
  text: string;
};

export type CourseAssessmentItem = {
  position: number;
  title: string;
  weight: number | null;
  hurdle: boolean | null;
  dueText: string | null;
  sourceText: string;
  learningOutcomePositions: number[];
};

export type CourseOfferingClass = {
  position: number;
  calendarYear: number;
  periodCode: string;
  periodName: string;
  classNumber: string | null;
  startsOn: string | null;
  endsOn: string | null;
  lastEnrolmentDate: string | null;
  censusDate: string | null;
  deliveryMode: string | null;
  location: string | null;
  classSummaryUrl: string | null;
  sourceText: string;
};

export type CourseRule =
  | { op: "completed"; courseCode: string; minimumMark?: number | null }
  | {
      op: "completed_or_concurrent";
      courseCode: string;
      minimumMark?: number | null;
    }
  | { op: "all_of" | "one_of"; rules: CourseRule[] }
  | { op: "min_units_total"; minimumUnits: number }
  | {
      op: "min_courses_from_subject";
      minimumCount: number;
      subjectCode: string;
    }
  | {
      op: "min_units_at_level";
      minimumUnits: number;
      level: number;
      maximumLevel?: number | null;
      subjectCode?: string | null;
    }
  | {
      op: "min_units_from_subject";
      minimumUnits: number;
      subjectCode: string;
    }
  | {
      op: "min_units_from_courses";
      minimumUnits: number;
      courseCodes: string[];
    }
  | { op: "enrolled_in"; programmeCode: string }
  | { op: "enrolled_in_college"; college: string }
  | { op: "equivalent_course"; sourceText: string }
  | { op: "enrolment_mode"; mode: EnrolmentMode; matches: boolean }
  | { op: "year_standing"; minimumYear: number }
  | {
      op: "commencement_year";
      minimumYear: number | null;
      maximumYear: number | null;
    }
  | {
      op: "minimum_gpa";
      value: number;
      scale: "anu7" | "wam100";
      recentGradedUnits?: number | null;
    }
  | { op: "permission"; sourceText?: string | null };

export type CourseIncompatibilityRule =
  | { op: "not_completed" | "not_concurrent"; courseCode: string }
  | { op: "all_of" | "one_of"; rules: CourseIncompatibilityRule[] }
  | { op: "permission"; sourceText: string };

export type CourseRequisites = {
  assumedKnowledgeText?: string | null;
  prerequisiteText: string | null;
  corequisiteText: string | null;
  incompatibilityText: string | null;
  prerequisiteRule: CourseRule | null;
  corequisiteRule: CourseRule | null;
  incompatibilityRule?: CourseIncompatibilityRule | null;
  incompatibilityCourseCodes: string[];
  softIncompatibilityCourseCodes: string[];
  concurrentIncompatibilityCourseCodes?: string[];
  softConcurrentIncompatibilityCourseCodes?: string[];
  unmodelledText: string[];
};

export type CourseRelatedCourse = {
  position: number;
  relationKind: "co_taught" | "equivalent" | "other";
  courseCode: string;
  courseTitle: string | null;
  sourceText: string;
};

export type CourseAttribute = {
  position: number;
  attributeKind: "graduate_attribute" | "stem" | "other";
  value: string;
  sourceText: string;
};

export type CourseExtractionEvidence = {
  fieldKey: string;
  sourceLocator: string;
  evidenceExcerpt: string;
  confidence: number;
  method: "model";
};

export type CourseExtractionReviewItem = {
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
 * The complete extraction contract for one course page, produced by the model.
 * Every property is present. Missing source data is represented by null or an
 * empty array, never by an omitted key.
 */
export type CourseExtraction = {
  schemaVersion: typeof COURSE_EXTRACTION_SCHEMA_VERSION;
  code: string;
  year: number;
  title: string;
  unitValue: CourseUnitValue;
  eftsl: number | null;
  level: number;
  subjectCode: string;
  subjectName: string | null;
  school: string | null;
  college: string | null;
  academicCareer: "UGRD" | "PGRD" | "RSCH" | "OTHER" | null;
  convenerText: string | null;
  deliverySummary: string | null;
  introduction: string | null;
  description: string | null;
  workloadText: string | null;
  workloadHours: number | null;
  workloadHoursBasis?: WorkloadHoursBasis | null;
  inherentRequirements: string | null;
  prescribedTexts: string | null;
  offeringStatus: "offered" | "not_offered" | "unknown";
  sourceUpdatedAt: string | null;
  areasOfInterest: string[];
  /** Recognised categories degree rules can count units against. */
  tags: string[];
  fees: CourseFee[];
  learningOutcomes: CourseLearningOutcome[];
  assessmentItems: CourseAssessmentItem[];
  offerings: CourseOfferingClass[];
  requisites: CourseRequisites;
  relatedCourses: CourseRelatedCourse[];
  attributes: CourseAttribute[];
  evidence: CourseExtractionEvidence[];
  overallConfidence: number | null;
  reviewItems: CourseExtractionReviewItem[];
};

export type CourseExtractionValidationIssue = {
  path: string;
  message: string;
};

export type CourseExtractionValidationResult =
  | { success: true; data: CourseExtraction; issues: [] }
  | { success: false; issues: CourseExtractionValidationIssue[] };

export type CourseExtractionValidationOptions = {
  expectedCode?: string;
  expectedYear?: number;
  knownPeriodCodes?: readonly string[];
  knownTags?: readonly string[];
};

function validateUnitValue(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  const kind = (value as UnknownRecord).kind;
  if (kind === "fixed") {
    const record = exactRecord(value, path, ["kind", "units"], issues);
    if (record)
      requireNumber(record.units, `${path}.units`, issues, { minimum: 0 });
  } else if (kind === "range") {
    const record = exactRecord(
      value,
      path,
      ["kind", "minimumUnits", "maximumUnits"],
      issues,
    );
    if (record) {
      requireNumber(record.minimumUnits, `${path}.minimumUnits`, issues, {
        minimum: 0,
      });
      requireNumber(record.maximumUnits, `${path}.maximumUnits`, issues, {
        minimum: 0,
      });
      if (
        typeof record.minimumUnits === "number" &&
        typeof record.maximumUnits === "number" &&
        record.maximumUnits < record.minimumUnits
      ) {
        issues.push({
          path,
          message: "maximumUnits must not be less than minimumUnits",
        });
      }
    }
  } else if (kind === "variable") {
    const record = exactRecord(value, path, ["kind", "unitsOptions"], issues);
    if (record) {
      requireArray(
        record.unitsOptions,
        `${path}.unitsOptions`,
        issues,
        (item, itemPath) =>
          requireNumber(item, itemPath, issues, { exclusiveMinimum: 0 }),
      );
      if (
        Array.isArray(record.unitsOptions) &&
        record.unitsOptions.length < 2
      ) {
        issues.push({
          path: `${path}.unitsOptions`,
          message: "must contain at least two values",
        });
      }
      if (
        Array.isArray(record.unitsOptions) &&
        new Set(record.unitsOptions).size !== record.unitsOptions.length
      ) {
        issues.push({
          path: `${path}.unitsOptions`,
          message: "must not repeat a unit value",
        });
      }
    }
  } else if (kind === "unknown") {
    exactRecord(value, path, ["kind"], issues);
  } else {
    issues.push({
      path: `${path}.kind`,
      message: "must be fixed, range, variable or unknown",
    });
  }
}

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function validateDistinctPositions(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
) {
  if (!Array.isArray(value)) return;
  const positions = new Set<number>();
  value.forEach((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      return;
    const position = (item as UnknownRecord).position;
    if (typeof position !== "number" || !Number.isInteger(position)) return;
    if (positions.has(position))
      issues.push({
        path: `${path}[${index}].position`,
        message: `duplicates position ${position}`,
      });
    positions.add(position);
  });
}

function validateDistinctValues(
  value: unknown,
  path: string,
  field: string,
  identity: (item: unknown) => string | null,
  issues: CourseExtractionValidationIssue[],
) {
  if (!Array.isArray(value)) return;
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const key = identity(item);
    if (key === null) return;
    if (seen.has(key))
      issues.push({
        path: `${path}[${index}]${field}`,
        message: "duplicates an earlier entry",
      });
    seen.add(key);
  });
}

function validateExtractionShape(
  value: unknown,
  issues: CourseExtractionValidationIssue[],
  options: CourseExtractionValidationOptions,
) {
  const record = exactRecord(
    value,
    "$",
    [
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
    issues,
    ["workloadHoursBasis"],
  );
  if (!record) return;

  requireEnum(
    record.schemaVersion,
    "$.schemaVersion",
    [COURSE_EXTRACTION_SCHEMA_VERSION],
    issues,
  );
  requireString(record.code, "$.code", issues, {
    pattern: COURSE_CODE_PATTERN,
  });
  requireNumber(record.year, "$.year", issues, {
    integer: true,
    minimum: 2000,
    maximum: 2200,
  });
  requireString(record.title, "$.title", issues);
  validateUnitValue(record.unitValue, "$.unitValue", issues);
  requireNumber(record.eftsl, "$.eftsl", issues, {
    nullable: true,
    minimum: 0,
  });
  requireNumber(record.level, "$.level", issues, {
    integer: true,
    minimum: 0,
    maximum: 9999,
  });
  const expectedLevel =
    typeof record.code === "string" ? courseLevelForCode(record.code) : null;
  if (expectedLevel !== null && record.level !== expectedLevel) {
    issues.push({
      path: "$.level",
      message: `must be ${expectedLevel} for ${record.code}, rather than the full course number or another level`,
    });
  }
  requireString(record.subjectCode, "$.subjectCode", issues, {
    pattern: /^[A-Z]{4}$/,
  });
  for (const key of [
    "subjectName",
    "school",
    "college",
    "convenerText",
    "deliverySummary",
    "introduction",
    "description",
    "workloadText",
    "inherentRequirements",
    "prescribedTexts",
  ] as const) {
    requireString(record[key], `$.${key}`, issues, { nullable: true });
  }
  requireEnum(
    record.academicCareer,
    "$.academicCareer",
    ["UGRD", "PGRD", "RSCH", "OTHER"],
    issues,
    true,
  );
  requireNumber(record.workloadHours, "$.workloadHours", issues, {
    nullable: true,
    minimum: 0,
  });
  if (record.workloadHoursBasis !== undefined) {
    requireEnum(
      record.workloadHoursBasis,
      "$.workloadHoursBasis",
      WORKLOAD_HOURS_BASES,
      issues,
      true,
    );
    if (record.workloadHoursBasis !== null && record.workloadHours === null) {
      issues.push({
        path: "$.workloadHoursBasis",
        message: "requires a stated workloadHours value",
      });
    }
  }
  requireEnum(
    record.offeringStatus,
    "$.offeringStatus",
    ["offered", "not_offered", "unknown"],
    issues,
  );
  requireString(record.sourceUpdatedAt, "$.sourceUpdatedAt", issues, {
    nullable: true,
    pattern: INSTANT_PATTERN,
  });

  requireArray(
    record.areasOfInterest,
    "$.areasOfInterest",
    issues,
    (item, path) => requireString(item, path, issues),
  );
  requireArray(record.tags, "$.tags", issues, (item, path) => {
    requireString(item, path, issues);
    if (
      typeof item === "string" &&
      options.knownTags !== undefined &&
      !options.knownTags.includes(item)
    ) {
      issues.push({
        path,
        message: `tag ${JSON.stringify(item)} must exactly match a recognised tag supplied with the input; suggest new categories in reviewItems instead`,
      });
    }
  });
  requireArray(record.fees, "$.fees", issues, (item, path) => {
    const fee = exactRecord(
      item,
      path,
      [
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
      issues,
    );
    if (!fee) return;
    requireNumber(fee.position, `${path}.position`, issues, {
      integer: true,
      minimum: 1,
    });
    requireNumber(fee.feeYear, `${path}.feeYear`, issues, {
      nullable: true,
      integer: true,
      minimum: 2000,
      maximum: 2200,
    });
    requireEnum(
      fee.audience,
      `${path}.audience`,
      ["domestic", "international", "commonwealth_supported", "other"],
      issues,
    );
    requireEnum(
      fee.feeType,
      `${path}.feeType`,
      ["student_contribution", "tuition", "indicative", "other"],
      issues,
    );
    requireNumber(fee.amount, `${path}.amount`, issues, {
      nullable: true,
      minimum: 0,
    });
    requireString(fee.currency, `${path}.currency`, issues, {
      nullable: true,
      pattern: /^[A-Z]{3}$/,
    });
    requireEnum(
      fee.basis,
      `${path}.basis`,
      ["course", "unit", "eftsl", "annual", "unknown"],
      issues,
    );
    requireNumber(
      fee.studentContributionBand,
      `${path}.studentContributionBand`,
      issues,
      { nullable: true, integer: true, minimum: 1 },
    );
    requireString(fee.sourceLabel, `${path}.sourceLabel`, issues, {
      nullable: true,
    });
    requireString(fee.sourceText, `${path}.sourceText`, issues);
  });

  requireArray(
    record.learningOutcomes,
    "$.learningOutcomes",
    issues,
    (item, path) => {
      const outcome = exactRecord(item, path, ["position", "text"], issues);
      if (!outcome) return;
      requireNumber(outcome.position, `${path}.position`, issues, {
        integer: true,
        minimum: 1,
      });
      requireString(outcome.text, `${path}.text`, issues);
    },
  );

  requireArray(
    record.assessmentItems,
    "$.assessmentItems",
    issues,
    (item, path) => {
      const assessment = exactRecord(
        item,
        path,
        [
          "position",
          "title",
          "weight",
          "hurdle",
          "dueText",
          "sourceText",
          "learningOutcomePositions",
        ],
        issues,
      );
      if (!assessment) return;
      requireNumber(assessment.position, `${path}.position`, issues, {
        integer: true,
        minimum: 1,
      });
      requireString(assessment.title, `${path}.title`, issues);
      requireNumber(assessment.weight, `${path}.weight`, issues, {
        nullable: true,
        minimum: 0,
        maximum: 100,
      });
      requireBoolean(assessment.hurdle, `${path}.hurdle`, issues, true);
      requireString(assessment.dueText, `${path}.dueText`, issues, {
        nullable: true,
      });
      requireString(assessment.sourceText, `${path}.sourceText`, issues);
      requireArray(
        assessment.learningOutcomePositions,
        `${path}.learningOutcomePositions`,
        issues,
        (outcome, outcomePath) =>
          requireNumber(outcome, outcomePath, issues, {
            integer: true,
            minimum: 1,
          }),
      );
    },
  );

  validateCourseOfferings(record, issues, options);

  validateCourseRequisites(record, issues);

  requireArray(
    record.relatedCourses,
    "$.relatedCourses",
    issues,
    (item, path) => {
      const related = exactRecord(
        item,
        path,
        ["position", "relationKind", "courseCode", "courseTitle", "sourceText"],
        issues,
      );
      if (!related) return;
      requireNumber(related.position, `${path}.position`, issues, {
        integer: true,
        minimum: 1,
      });
      requireEnum(
        related.relationKind,
        `${path}.relationKind`,
        ["co_taught", "equivalent", "other"],
        issues,
      );
      requireString(related.courseCode, `${path}.courseCode`, issues, {
        pattern: COURSE_CODE_PATTERN,
      });
      requireString(related.courseTitle, `${path}.courseTitle`, issues, {
        nullable: true,
      });
      requireString(related.sourceText, `${path}.sourceText`, issues);
    },
  );

  requireArray(record.attributes, "$.attributes", issues, (item, path) => {
    const attribute = exactRecord(
      item,
      path,
      ["position", "attributeKind", "value", "sourceText"],
      issues,
    );
    if (!attribute) return;
    requireNumber(attribute.position, `${path}.position`, issues, {
      integer: true,
      minimum: 1,
    });
    requireEnum(
      attribute.attributeKind,
      `${path}.attributeKind`,
      ["graduate_attribute", "stem", "other"],
      issues,
    );
    requireString(attribute.value, `${path}.value`, issues);
    requireString(attribute.sourceText, `${path}.sourceText`, issues);
  });

  requireArray(record.evidence, "$.evidence", issues, (item, path) => {
    const evidence = exactRecord(
      item,
      path,
      ["fieldKey", "sourceLocator", "evidenceExcerpt", "confidence", "method"],
      issues,
    );
    if (!evidence) return;
    requireString(evidence.fieldKey, `${path}.fieldKey`, issues, {
      pattern: /^[A-Za-z][A-Za-z0-9.[\]_]*$/,
    });
    requireString(evidence.sourceLocator, `${path}.sourceLocator`, issues);
    requireString(evidence.evidenceExcerpt, `${path}.evidenceExcerpt`, issues);
    requireNumber(evidence.confidence, `${path}.confidence`, issues, {
      minimum: 0,
      maximum: 1,
    });
    requireEnum(evidence.method, `${path}.method`, ["model"], issues);
  });
  requireNumber(record.overallConfidence, "$.overallConfidence", issues, {
    nullable: true,
    minimum: 0,
    maximum: 1,
  });
  requireArray(record.reviewItems, "$.reviewItems", issues, (item, path) => {
    const review = exactRecord(
      item,
      path,
      ["fieldKey", "kind", "severity", "message"],
      issues,
    );
    if (!review) return;
    requireString(review.fieldKey, `${path}.fieldKey`, issues);
    requireEnum(
      review.kind,
      `${path}.kind`,
      [
        "missing",
        "ambiguous",
        "conflict",
        "unsupported",
        "invalid",
        "evidence_missing",
      ],
      issues,
    );
    requireEnum(
      review.severity,
      `${path}.severity`,
      ["warning", "error"],
      issues,
    );
    requireString(review.message, `${path}.message`, issues);
  });

  for (const key of [
    "fees",
    "learningOutcomes",
    "assessmentItems",
    "offerings",
    "attributes",
    "relatedCourses",
  ] as const)
    validateDistinctPositions(record[key], `$.${key}`, issues);

  validateDistinctValues(
    record.areasOfInterest,
    "$.areasOfInterest",
    "",
    (item) => (typeof item === "string" ? cleanText(item) : null),
    issues,
  );
  validateDistinctValues(
    record.attributes,
    "$.attributes",
    ".value",
    (item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        return null;
      const { attributeKind, value } = item as UnknownRecord;
      return typeof attributeKind === "string" && typeof value === "string"
        ? `${attributeKind}\u0000${cleanText(value)}`
        : null;
    },
    issues,
  );
  validateDistinctValues(
    record.relatedCourses,
    "$.relatedCourses",
    ".courseCode",
    (item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        return null;
      const { relationKind, courseCode } = item as UnknownRecord;
      return typeof relationKind === "string" && typeof courseCode === "string"
        ? `${relationKind}\u0000${courseCode}`
        : null;
    },
    issues,
  );

  if (
    Array.isArray(record.learningOutcomes) &&
    Array.isArray(record.assessmentItems)
  ) {
    const outcomePositions = new Set(
      record.learningOutcomes
        .filter(
          (outcome): outcome is UnknownRecord =>
            typeof outcome === "object" &&
            outcome !== null &&
            !Array.isArray(outcome),
        )
        .map((outcome) => outcome.position)
        .filter(
          (position): position is number =>
            typeof position === "number" && Number.isInteger(position),
        ),
    );
    record.assessmentItems.forEach((item, assessmentIndex) => {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        return;
      const links = (item as UnknownRecord).learningOutcomePositions;
      if (!Array.isArray(links)) return;
      const seen = new Set<number>();
      links.forEach((position, linkIndex) => {
        if (typeof position !== "number" || !Number.isInteger(position)) return;
        const path = `$.assessmentItems[${assessmentIndex}].learningOutcomePositions[${linkIndex}]`;
        if (seen.has(position))
          issues.push({
            path,
            message: `repeats outcome position ${position}`,
          });
        if (!outcomePositions.has(position))
          issues.push({
            path,
            message: `references missing outcome position ${position}`,
          });
        seen.add(position);
      });
    });
  }

  if (
    options.expectedCode &&
    record.code !== options.expectedCode.toUpperCase()
  ) {
    issues.push({
      path: "$.code",
      message: `must equal ${options.expectedCode.toUpperCase()}`,
    });
  }
  if (
    options.expectedYear !== undefined &&
    record.year !== options.expectedYear
  ) {
    issues.push({
      path: "$.year",
      message: `must equal ${options.expectedYear}`,
    });
  }
}

export function validateCourseExtraction(
  value: unknown,
  options: CourseExtractionValidationOptions = {},
): CourseExtractionValidationResult {
  const issues: CourseExtractionValidationIssue[] = [];
  validateExtractionShape(value, issues, options);
  return issues.length === 0
    ? { success: true, data: value as CourseExtraction, issues: [] }
    : { success: false, issues };
}

export function parseCourseExtraction(
  value: unknown,
  options: CourseExtractionValidationOptions = {},
) {
  const result = validateCourseExtraction(value, options);
  if (!result.success) {
    const detail = result.issues
      .slice(0, 10)
      .map(({ path, message }) => `${path} ${message}`)
      .join("; ");
    throw new TypeError(`Invalid course extraction: ${detail}`);
  }
  return result.data;
}
