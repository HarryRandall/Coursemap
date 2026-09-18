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
  | { op: "completed"; courseCode: string }
  | { op: "completed_or_concurrent"; courseCode: string }
  | { op: "all_of" | "one_of"; rules: CourseRule[] }
  | { op: "min_units_total"; minimumUnits: number }
  | {
      op: "min_units_at_level";
      minimumUnits: number;
      level: number;
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
  | { op: "year_standing"; minimumYear: number }
  | { op: "minimum_gpa"; value: number; scale: "anu7" | "wam100" }
  | { op: "permission" };

export type CourseRequisites = {
  prerequisiteText: string | null;
  corequisiteText: string | null;
  incompatibilityText: string | null;
  prerequisiteRule: CourseRule | null;
  corequisiteRule: CourseRule | null;
  incompatibilityCourseCodes: string[];
  softIncompatibilityCourseCodes: string[];
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
  method: "deterministic" | "model";
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
 * The complete extraction contract shared by deterministic parsing, the model
 * response and the merge step. Every property is present. Missing source data
 * is represented by null or an empty array, never by an omitted key.
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
  inherentRequirements: string | null;
  prescribedTexts: string | null;
  offeringStatus: "offered" | "not_offered" | "unknown";
  sourceUpdatedAt: string | null;
  areasOfInterest: string[];
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
  evidenceMethod?: CourseExtractionEvidence["method"];
};

type UnknownRecord = Record<string, unknown>;

function exactRecord(
  value: unknown,
  path: string,
  keys: readonly string[],
  issues: CourseExtractionValidationIssue[],
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
  const expected = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) {
      issues.push({ path: `${path}.${key}`, message: "is required" });
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
  }: {
    nullable?: boolean;
    integer?: boolean;
    minimum?: number;
    maximum?: number;
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
    const record = exactRecord(value, path, ["op", "courseCode"], issues);
    if (record)
      requireString(record.courseCode, `${path}.courseCode`, issues, {
        pattern: COURSE_CODE_PATTERN,
      });
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
        minimum: 0,
      });
  } else if (op === "min_units_at_level") {
    const record = exactRecord(
      value,
      path,
      ["op", "minimumUnits", "level"],
      issues,
    );
    if (record) {
      requireNumber(record.minimumUnits, `${path}.minimumUnits`, issues, {
        minimum: 0,
      });
      requireNumber(record.level, `${path}.level`, issues, {
        integer: true,
        minimum: 0,
        maximum: 9999,
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
        minimum: 0,
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
        minimum: 0,
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
  } else if (op === "year_standing") {
    const record = exactRecord(value, path, ["op", "minimumYear"], issues);
    if (record)
      requireNumber(record.minimumYear, `${path}.minimumYear`, issues, {
        integer: true,
        minimum: 1,
        maximum: 10,
      });
  } else if (op === "minimum_gpa") {
    const record = exactRecord(value, path, ["op", "value", "scale"], issues);
    if (record) {
      requireNumber(record.value, `${path}.value`, issues, {
        minimum: 0,
        maximum: record.scale === "anu7" ? 7 : 100,
      });
      requireEnum(record.scale, `${path}.scale`, ["anu7", "wam100"], issues);
    }
  } else if (op === "permission") {
    exactRecord(value, path, ["op"], issues);
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
        Number(date.slice(0, 4)) !== offering.calendarYear
      ) {
        issues.push({
          path: `${path}.${field}`,
          message: "must belong to the offering calendar year",
        });
      }
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
  );
  if (requisites) {
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
    requireEnum(
      evidence.method,
      `${path}.method`,
      ["deterministic", "model"],
      issues,
    );
    if (options.evidenceMethod && evidence.method !== options.evidenceMethod) {
      issues.push({
        path: `${path}.method`,
        message: `must be ${options.evidenceMethod}`,
      });
    }
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

// OpenRouter receives this in the system message while JSON object mode keeps
// Gemini from rejecting the complete, deeply nested schema at the provider
// boundary. The runtime validator above remains authoritative and adds the
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
    level: { type: "integer", minimum: 0, maximum: 9999 },
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
    inherentRequirements: { type: ["string", "null"] },
    prescribedTexts: { type: ["string", "null"] },
    offeringStatus: { enum: ["offered", "not_offered", "unknown"] },
    sourceUpdatedAt: { $ref: "#/$defs/nullableInstant" },
    areasOfInterest: { type: "array", items: { type: "string", minLength: 1 } },
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
            minimumUnits: { type: "number", minimum: 0 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits", "level"],
          properties: {
            op: { const: "min_units_at_level" },
            minimumUnits: { type: "number", minimum: 0 },
            level: { type: "integer", minimum: 0, maximum: 9999 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits", "subjectCode"],
          properties: {
            op: { const: "min_units_from_subject" },
            minimumUnits: { type: "number", minimum: 0 },
            subjectCode: { type: "string", pattern: "^[A-Z]{4}$" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op", "minimumUnits", "courseCodes"],
          properties: {
            op: { const: "min_units_from_courses" },
            minimumUnits: { type: "number", minimum: 0 },
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
            programmeCode: { type: "string", minLength: 1 },
          },
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
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["op"],
          properties: { op: { const: "permission" } },
        },
      ],
    },
    requisites: {
      type: "object",
      additionalProperties: false,
      required: [
        "prerequisiteText",
        "corequisiteText",
        "incompatibilityText",
        "prerequisiteRule",
        "corequisiteRule",
        "incompatibilityCourseCodes",
        "softIncompatibilityCourseCodes",
        "unmodelledText",
      ],
      properties: {
        prerequisiteText: { $ref: "#/$defs/nullableString" },
        corequisiteText: { $ref: "#/$defs/nullableString" },
        incompatibilityText: { $ref: "#/$defs/nullableString" },
        prerequisiteRule: {
          anyOf: [{ $ref: "#/$defs/rule" }, { type: "null" }],
        },
        corequisiteRule: {
          anyOf: [{ $ref: "#/$defs/rule" }, { type: "null" }],
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
