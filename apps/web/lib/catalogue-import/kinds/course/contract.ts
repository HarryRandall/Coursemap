import {
  ENROLMENT_MODES,
  type EnrolmentMode,
} from "../../../academic/enrolment-mode.ts";
import { validCommencementYearBounds } from "../../../academic/commencement-year.ts";
import {
  WORKLOAD_HOURS_BASES,
  type WorkloadHoursBasis,
} from "../../../academic/workload.ts";
import { courseLevelForCode } from "../../../academic/course-level.ts";

export const COURSE_EXTRACTION_SCHEMA_VERSION = "course-extraction.v2" as const;

export const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/;

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

type UnknownRecord = Record<string, unknown>;

function exactRecord(
  value: unknown,
  path: string,
  keys: readonly string[],
  issues: CourseExtractionValidationIssue[],
  optionalKeys: readonly string[] = [],
): UnknownRecord | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    issues.push({ path, message: "must be an object" });
    return null;
  }

  const record = value as UnknownRecord;
  const expected = new Set([...keys, ...optionalKeys]);
  // An absent key is normalised to null rather than rejected outright, so the
  // field's own rule decides. Nullable fields then accept the omission and
  // fields that need a value still fail with their own message. Treating
  // absence as a whole-document error discarded entire extractions over one
  // missing nullable key.
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) {
      record[key] = null;
    }
  }
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      issues.push({ path: `${path}.${key}`, message: "is not allowed" });
    }
  }
  return record;
}

function requireString(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  { nullable = false, pattern }: { nullable?: boolean; pattern?: RegExp } = {},
) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({
      path,
      message: nullable
        ? "must be a non-empty string or null"
        : "must be a non-empty string",
    });
    return;
  }
  if (pattern && !pattern.test(value)) {
    issues.push({ path, message: "has an invalid format" });
  }
}

function requireNumber(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  {
    nullable = false,
    integer = false,
    minimum,
    maximum,
    exclusiveMinimum,
  }: {
    nullable?: boolean;
    integer?: boolean;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
  } = {},
) {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({
      path,
      message: nullable
        ? "must be a finite number or null"
        : "must be a finite number",
    });
    return;
  }
  if (integer && !Number.isInteger(value)) {
    issues.push({ path, message: "must be an integer" });
  }
  if (minimum !== undefined && value < minimum) {
    issues.push({ path, message: `must be at least ${minimum}` });
  }
  if (maximum !== undefined && value > maximum) {
    issues.push({ path, message: `must be at most ${maximum}` });
  }
  if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
    issues.push({ path, message: `must be greater than ${exclusiveMinimum}` });
  }
}

function requireBoolean(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  nullable = false,
) {
  if (nullable && value === null) return;
  if (typeof value !== "boolean") {
    issues.push({
      path,
      message: nullable ? "must be a boolean or null" : "must be a boolean",
    });
  }
}

function requireEnum(
  value: unknown,
  path: string,
  allowed: readonly unknown[],
  issues: CourseExtractionValidationIssue[],
  nullable = false,
) {
  if (nullable && value === null) return;
  if (!allowed.includes(value)) {
    issues.push({
      path,
      message: `must be one of ${allowed.join(", ")}${nullable ? ", null" : ""}`,
    });
  }
}

function requireArray(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  validate: (item: unknown, itemPath: string) => void,
) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }
  value.forEach((item, index) => validate(item, `${path}[${index}]`));
}

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
          requireNumber(item, itemPath, issues, { minimum: 0 }),
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

function validateIncompatibilityRule(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  exclusions: Array<{ op: string; courseCode: string }>,
  depth = 0,
) {
  if (depth > 16) {
    issues.push({ path, message: "exceeds the maximum rule nesting depth" });
    return;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ path, message: "must be an incompatibility rule object" });
    return;
  }
  const op = (value as UnknownRecord).op;
  if (op === "not_completed" || op === "not_concurrent") {
    const record = exactRecord(value, path, ["op", "courseCode"], issues);
    if (record) {
      requireString(record.courseCode, `${path}.courseCode`, issues, {
        pattern: COURSE_CODE_PATTERN,
      });
      if (typeof record.courseCode === "string")
        exclusions.push({ op, courseCode: record.courseCode });
    }
  } else if (op === "permission") {
    const record = exactRecord(value, path, ["op", "sourceText"], issues);
    if (record) requireString(record.sourceText, `${path}.sourceText`, issues);
  } else if (op === "all_of" || op === "one_of") {
    const record = exactRecord(value, path, ["op", "rules"], issues);
    if (!record) return;
    requireArray(record.rules, `${path}.rules`, issues, (child, childPath) =>
      validateIncompatibilityRule(
        child,
        childPath,
        issues,
        exclusions,
        depth + 1,
      ),
    );
    if (Array.isArray(record.rules) && record.rules.length < 2)
      issues.push({
        path: `${path}.rules`,
        message: "must contain at least two rules",
      });
  } else {
    issues.push({
      path: `${path}.op`,
      message:
        "must be not_completed, not_concurrent, permission, all_of or one_of",
    });
  }
}

function validateRule(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  depth = 0,
) {
  if (depth > 16) {
    issues.push({ path, message: "exceeds the maximum rule nesting depth" });
    return;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ path, message: "must be a rule object" });
    return;
  }
  const op = (value as UnknownRecord).op;
  if (op === "completed" || op === "completed_or_concurrent") {
    const record = exactRecord(value, path, ["op", "courseCode"], issues, [
      "minimumMark",
    ]);
    if (record) {
      if (record.minimumMark !== undefined) {
        requireNumber(record.minimumMark, `${path}.minimumMark`, issues, {
          nullable: true,
          minimum: 0,
          maximum: 100,
        });
      }
      requireString(record.courseCode, `${path}.courseCode`, issues, {
        pattern: COURSE_CODE_PATTERN,
      });
    }
  } else if (op === "all_of" || op === "one_of") {
    const record = exactRecord(value, path, ["op", "rules"], issues);
    if (record) {
      requireArray(record.rules, `${path}.rules`, issues, (item, itemPath) =>
        validateRule(item, itemPath, issues, depth + 1),
      );
      if (Array.isArray(record.rules) && record.rules.length < 2) {
        issues.push({
          path: `${path}.rules`,
          message: "must contain at least two rules",
        });
      }
    }
  } else if (op === "min_units_total") {
    const record = exactRecord(value, path, ["op", "minimumUnits"], issues);
    if (record)
      requireNumber(record.minimumUnits, `${path}.minimumUnits`, issues, {
        exclusiveMinimum: 0,
      });
  } else if (op === "min_units_at_level") {
    const record = exactRecord(
      value,
      path,
      ["op", "minimumUnits", "level"],
      issues,
      ["maximumLevel", "subjectCode"],
    );
    if (record) {
      requireNumber(record.minimumUnits, `${path}.minimumUnits`, issues, {
        exclusiveMinimum: 0,
      });
      requireNumber(record.level, `${path}.level`, issues, {
        integer: true,
        minimum: 0,
        maximum: 9999,
      });
      if (record.maximumLevel !== undefined) {
        requireNumber(record.maximumLevel, `${path}.maximumLevel`, issues, {
          nullable: true,
          integer: true,
          minimum: typeof record.level === "number" ? record.level : 0,
          maximum: 9999,
        });
      }
      if (record.subjectCode !== undefined) {
        requireString(record.subjectCode, `${path}.subjectCode`, issues, {
          nullable: true,
          pattern: /^[A-Z]{4}$/,
        });
      }
    }
  } else if (op === "min_courses_from_subject") {
    const record = exactRecord(
      value,
      path,
      ["op", "minimumCount", "subjectCode"],
      issues,
    );
    if (record) {
      requireNumber(record.minimumCount, `${path}.minimumCount`, issues, {
        integer: true,
        minimum: 1,
        maximum: 32767,
      });
      requireString(record.subjectCode, `${path}.subjectCode`, issues, {
        pattern: /^[A-Z]{4}$/,
      });
    }
  } else if (op === "min_units_from_subject") {
    const record = exactRecord(
      value,
      path,
      ["op", "minimumUnits", "subjectCode"],
      issues,
    );
    if (record) {
      requireNumber(record.minimumUnits, `${path}.minimumUnits`, issues, {
        exclusiveMinimum: 0,
      });
      requireString(record.subjectCode, `${path}.subjectCode`, issues, {
        pattern: /^[A-Z]{4}$/,
      });
    }
  } else if (op === "min_units_from_courses") {
    const record = exactRecord(
      value,
      path,
      ["op", "minimumUnits", "courseCodes"],
      issues,
    );
    if (record) {
      requireNumber(record.minimumUnits, `${path}.minimumUnits`, issues, {
        exclusiveMinimum: 0,
      });
      requireArray(
        record.courseCodes,
        `${path}.courseCodes`,
        issues,
        (item, itemPath) =>
          requireString(item, itemPath, issues, {
            pattern: COURSE_CODE_PATTERN,
          }),
      );
    }
  } else if (op === "enrolled_in") {
    const record = exactRecord(value, path, ["op", "programmeCode"], issues);
    if (record)
      requireString(record.programmeCode, `${path}.programmeCode`, issues, {
        pattern: /^[A-Z0-9-]{3,20}$/,
      });
  } else if (op === "enrolled_in_college") {
    const record = exactRecord(value, path, ["op", "college"], issues);
    if (record) requireString(record.college, `${path}.college`, issues);
  } else if (op === "equivalent_course") {
    const record = exactRecord(value, path, ["op", "sourceText"], issues);
    if (record) requireString(record.sourceText, `${path}.sourceText`, issues);
  } else if (op === "enrolment_mode") {
    const record = exactRecord(value, path, ["op", "mode", "matches"], issues);
    if (record) {
      requireEnum(record.mode, `${path}.mode`, ENROLMENT_MODES, issues);
      requireBoolean(record.matches, `${path}.matches`, issues);
    }
  } else if (op === "commencement_year") {
    const record = exactRecord(
      value,
      path,
      ["op", "minimumYear", "maximumYear"],
      issues,
    );
    if (record) {
      for (const key of ["minimumYear", "maximumYear"] as const)
        requireNumber(record[key], `${path}.${key}`, issues, {
          nullable: true,
          integer: true,
          minimum: 1900,
          maximum: 9999,
        });
      if (
        !validCommencementYearBounds({
          minimumCommencementYear: record.minimumYear as number | null,
          maximumCommencementYear: record.maximumYear as number | null,
        })
      )
        issues.push({
          path,
          message:
            "must have an ordered commencement-year range with at least one calendar-year bound",
        });
    }
  } else if (op === "year_standing") {
    const record = exactRecord(value, path, ["op", "minimumYear"], issues);
    if (record)
      requireNumber(record.minimumYear, `${path}.minimumYear`, issues, {
        integer: true,
        minimum: 1,
        maximum: 10,
      });
  } else if (op === "minimum_gpa") {
    const record = exactRecord(value, path, ["op", "value", "scale"], issues, [
      "recentGradedUnits",
    ]);
    if (record) {
      requireNumber(record.value, `${path}.value`, issues, {
        minimum: 0,
        maximum: record.scale === "anu7" ? 7 : 100,
      });
      requireEnum(record.scale, `${path}.scale`, ["anu7", "wam100"], issues);
      if (record.recentGradedUnits !== undefined)
        requireNumber(
          record.recentGradedUnits,
          `${path}.recentGradedUnits`,
          issues,
          { nullable: true, integer: true, minimum: 1, maximum: 300 },
        );
    }
  } else if (op === "permission") {
    const record = exactRecord(value, path, ["op"], issues, ["sourceText"]);
    if (record?.sourceText !== undefined) {
      requireString(record.sourceText, `${path}.sourceText`, issues, {
        nullable: true,
      });
    }
  } else {
    issues.push({
      path: `${path}.op`,
      message: "is not a supported requisite operation",
    });
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ANU_PROGRAMS_AND_COURSES_ORIGIN = "https://programsandcourses.anu.edu.au";
const CLASS_SUMMARY_PATH =
  /^\/(?:\d{4}\/)?course\/([A-Z]{4}\d{4}[A-Z]?)\/[^/]+\/\d+\/?$/iu;

function isRealIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normaliseAnuClassSummaryUrl(
  value: string | null | undefined,
  {
    baseUrl,
    expectedCourseCode,
  }: { baseUrl?: string; expectedCourseCode?: string } = {},
) {
  if (!value) return null;
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== ANU_PROGRAMS_AND_COURSES_ORIGIN ||
      url.username ||
      url.password
    ) {
      return null;
    }
    const match = CLASS_SUMMARY_PATH.exec(url.pathname);
    const courseCode = match?.[1]?.toUpperCase();
    if (
      !courseCode ||
      (expectedCourseCode && courseCode !== expectedCourseCode.toUpperCase())
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function nullableDate(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
) {
  requireString(value, path, issues, { nullable: true, pattern: DATE_PATTERN });
  if (
    typeof value === "string" &&
    DATE_PATTERN.test(value) &&
    !isRealIsoDate(value)
  ) {
    issues.push({ path, message: "must be a real calendar date" });
  }
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

  requireArray(record.offerings, "$.offerings", issues, (item, path) => {
    const offering = exactRecord(
      item,
      path,
      [
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
      issues,
    );
    if (!offering) return;
    requireNumber(offering.position, `${path}.position`, issues, {
      integer: true,
      minimum: 1,
    });
    requireNumber(offering.calendarYear, `${path}.calendarYear`, issues, {
      integer: true,
      minimum: 2000,
      maximum: 2200,
    });
    requireString(offering.periodCode, `${path}.periodCode`, issues);
    if (
      options.knownPeriodCodes !== undefined &&
      typeof offering.periodCode === "string" &&
      !options.knownPeriodCodes.includes(offering.periodCode)
    ) {
      issues.push({
        path: `${path}.periodCode`,
        message:
          "must be a recognised academic period code for the selected year",
      });
    }
    requireString(offering.periodName, `${path}.periodName`, issues);
    requireString(offering.classNumber, `${path}.classNumber`, issues, {
      nullable: true,
      pattern: /^\d+$/,
    });
    nullableDate(offering.startsOn, `${path}.startsOn`, issues);
    nullableDate(offering.endsOn, `${path}.endsOn`, issues);
    nullableDate(
      offering.lastEnrolmentDate,
      `${path}.lastEnrolmentDate`,
      issues,
    );
    nullableDate(offering.censusDate, `${path}.censusDate`, issues);
    for (const [field, date] of [
      ["startsOn", offering.startsOn],
      ["endsOn", offering.endsOn],
      ["lastEnrolmentDate", offering.lastEnrolmentDate],
      ["censusDate", offering.censusDate],
    ] as const) {
      if (
        typeof date === "string" &&
        DATE_PATTERN.test(date) &&
        typeof offering.calendarYear === "number" &&
        (Number(date.slice(0, 4)) < offering.calendarYear ||
          Number(date.slice(0, 4)) >
            offering.calendarYear + (field === "startsOn" ? 0 : 1))
      ) {
        issues.push({
          path: `${path}.${field}`,
          message:
            field === "startsOn"
              ? "must belong to the offering calendar year"
              : "must belong to the offering calendar year or the following year",
        });
      }
    }
    if (
      typeof offering.startsOn === "string" &&
      typeof offering.endsOn === "string" &&
      DATE_PATTERN.test(offering.startsOn) &&
      DATE_PATTERN.test(offering.endsOn) &&
      offering.endsOn < offering.startsOn
    ) {
      issues.push({
        path: `${path}.endsOn`,
        message: "must not be before startsOn",
      });
    }
    requireString(offering.deliveryMode, `${path}.deliveryMode`, issues, {
      nullable: true,
    });
    requireString(offering.location, `${path}.location`, issues, {
      nullable: true,
    });
    requireString(offering.classSummaryUrl, `${path}.classSummaryUrl`, issues, {
      nullable: true,
    });
    if (typeof offering.classSummaryUrl === "string") {
      if (
        normaliseAnuClassSummaryUrl(offering.classSummaryUrl, {
          expectedCourseCode:
            typeof record.code === "string" ? record.code : undefined,
        }) === null
      ) {
        issues.push({
          path: `${path}.classSummaryUrl`,
          message:
            "must be a complete same-course ANU Programs and Courses class summary URL",
        });
      }
    }
    requireString(offering.sourceText, `${path}.sourceText`, issues);
    if (
      typeof offering.calendarYear === "number" &&
      typeof record.year === "number" &&
      offering.calendarYear !== record.year
    ) {
      issues.push({
        path: `${path}.calendarYear`,
        message: "must match the extraction year",
      });
    }
  });

  const requisites = exactRecord(
    record.requisites,
    "$.requisites",
    [
      "prerequisiteText",
      "corequisiteText",
      "incompatibilityText",
      "prerequisiteRule",
      "corequisiteRule",
      "incompatibilityCourseCodes",
      "softIncompatibilityCourseCodes",
      "unmodelledText",
    ],
    issues,
    [
      "assumedKnowledgeText",
      "incompatibilityRule",
      "concurrentIncompatibilityCourseCodes",
      "softConcurrentIncompatibilityCourseCodes",
    ],
  );
  if (requisites) {
    if (requisites.assumedKnowledgeText !== undefined) {
      requireString(
        requisites.assumedKnowledgeText,
        "$.requisites.assumedKnowledgeText",
        issues,
        { nullable: true },
      );
    }
    requireString(
      requisites.prerequisiteText,
      "$.requisites.prerequisiteText",
      issues,
      { nullable: true },
    );
    requireString(
      requisites.corequisiteText,
      "$.requisites.corequisiteText",
      issues,
      { nullable: true },
    );
    requireString(
      requisites.incompatibilityText,
      "$.requisites.incompatibilityText",
      issues,
      { nullable: true },
    );
    if (requisites.prerequisiteRule !== null)
      validateRule(
        requisites.prerequisiteRule,
        "$.requisites.prerequisiteRule",
        issues,
      );
    if (requisites.corequisiteRule !== null)
      validateRule(
        requisites.corequisiteRule,
        "$.requisites.corequisiteRule",
        issues,
      );
    if (
      requisites.incompatibilityRule !== undefined &&
      requisites.incompatibilityRule !== null
    ) {
      const exclusions: Array<{ op: string; courseCode: string }> = [];
      validateIncompatibilityRule(
        requisites.incompatibilityRule,
        "$.requisites.incompatibilityRule",
        issues,
        exclusions,
      );
      for (const exclusion of exclusions) {
        const key =
          exclusion.op === "not_completed"
            ? "incompatibilityCourseCodes"
            : "concurrentIncompatibilityCourseCodes";
        if (
          Array.isArray(requisites[key]) &&
          requisites[key].includes(exclusion.courseCode)
        )
          issues.push({
            path: `$.requisites.${key}`,
            message: `${exclusion.courseCode} is already represented in incompatibilityRule; an unconditional duplicate would lose its scope`,
          });
      }
    }
    for (const key of [
      "incompatibilityCourseCodes",
      "softIncompatibilityCourseCodes",
    ] as const) {
      requireArray(
        requisites[key],
        `$.requisites.${key}`,
        issues,
        (item, path) =>
          requireString(item, path, issues, { pattern: COURSE_CODE_PATTERN }),
      );
    }
    for (const key of [
      "concurrentIncompatibilityCourseCodes",
      "softConcurrentIncompatibilityCourseCodes",
    ] as const) {
      if (requisites[key] !== undefined)
        requireArray(
          requisites[key],
          `$.requisites.${key}`,
          issues,
          (item, path) =>
            requireString(item, path, issues, { pattern: COURSE_CODE_PATTERN }),
        );
    }
    requireArray(
      requisites.unmodelledText,
      "$.requisites.unmodelledText",
      issues,
      (item, path) => requireString(item, path, issues),
    );
  }

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
