import { ENROLMENT_MODES } from "../../../academic/enrolment-mode.ts";
import { validCommencementYearBounds } from "../../../academic/commencement-year.ts";
import { PROGRAMME_CAREERS } from "../../../academic/programme-career.ts";
import { catalogueKindForCode } from "../../../catalogue/record-reference.ts";
import type { CourseExtractionValidationIssue } from "./contract.ts";
import {
  COURSE_CODE_PATTERN,
  type UnknownRecord,
  exactRecord,
  requireArray,
  requireBoolean,
  requireEnum,
  requireNumber,
  requireString,
} from "./validation-helpers.ts";

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

/** Major, minor and specialisation codes, such as MATH-MAJ or MATH-HSPC. */
const STRUCTURE_CODE_PATTERN = /^[A-Z0-9]{2,16}-(?:MAJ|MIN|SPEC|HSPC)$/u;

/** A course filter is null for "any", otherwise a non-empty distinct list. */
function validateFilterList(
  value: unknown,
  path: string,
  issues: CourseExtractionValidationIssue[],
  {
    validate,
    label,
  }: {
    validate: (item: unknown, path: string) => void;
    label: string;
  },
) {
  if (value === null) return;
  requireArray(value, path, issues, validate);
  if (!Array.isArray(value)) return;
  if (value.length === 0)
    issues.push({
      path,
      message: `must be null or contain at least one ${label}`,
    });
  if (new Set(value).size !== value.length)
    issues.push({ path, message: `must not repeat a ${label}` });
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
      if (Array.isArray(record.courseCodes)) {
        if (record.courseCodes.length === 0)
          issues.push({
            path: `${path}.courseCodes`,
            message: "must contain at least one course",
          });
        if (new Set(record.courseCodes).size !== record.courseCodes.length)
          issues.push({
            path: `${path}.courseCodes`,
            message: "must not repeat a course",
          });
      }
    }
  } else if (op === "min_courses_matching" || op === "min_units_matching") {
    const amountKey =
      op === "min_courses_matching" ? "minimumCount" : "minimumUnits";
    const record = exactRecord(
      value,
      path,
      ["op", amountKey, "subjectCodes", "levels", "includeConcurrent"],
      issues,
    );
    if (record) {
      requireNumber(
        record[amountKey],
        `${path}.${amountKey}`,
        issues,
        op === "min_courses_matching"
          ? { integer: true, minimum: 1, maximum: 32767 }
          : { exclusiveMinimum: 0 },
      );
      validateFilterList(record.subjectCodes, `${path}.subjectCodes`, issues, {
        validate: (item, itemPath) =>
          requireString(item, itemPath, issues, { pattern: /^[A-Z]{4}$/ }),
        label: "subject",
      });
      validateFilterList(record.levels, `${path}.levels`, issues, {
        validate: (item, itemPath) =>
          requireNumber(item, itemPath, issues, {
            integer: true,
            minimum: 0,
            maximum: 9999,
          }),
        label: "level",
      });
      if (record.subjectCodes === null && record.levels === null)
        issues.push({
          path,
          message: "must filter by subjectCodes, levels or both",
        });
      requireBoolean(
        record.includeConcurrent,
        `${path}.includeConcurrent`,
        issues,
      );
    }
  } else if (op === "enrolled_in") {
    const isTitle =
      typeof value === "object" &&
      value !== null &&
      "programmeTitle" in value &&
      !("programmeCode" in value);
    const record = exactRecord(
      value,
      path,
      ["op", isTitle ? "programmeTitle" : "programmeCode"],
      issues,
    );
    if (record && isTitle)
      requireString(record.programmeTitle, `${path}.programmeTitle`, issues);
    else if (record)
      requireString(record.programmeCode, `${path}.programmeCode`, issues, {
        pattern: /^[A-Z0-9-]{3,20}$/,
      });
  } else if (op === "enrolled_in_career") {
    const record = exactRecord(
      value,
      path,
      ["op", "career", "matches"],
      issues,
    );
    if (record) {
      requireEnum(record.career, `${path}.career`, PROGRAMME_CAREERS, issues);
      requireBoolean(record.matches, `${path}.matches`, issues);
    }
  } else if (op === "enrolled_in_structure") {
    const record = exactRecord(
      value,
      path,
      ["op", "structureCode", "structureKind"],
      issues,
    );
    if (record) {
      requireString(record.structureCode, `${path}.structureCode`, issues, {
        pattern: STRUCTURE_CODE_PATTERN,
      });
      requireEnum(
        record.structureKind,
        `${path}.structureKind`,
        ["major", "minor", "specialisation"],
        issues,
      );
      if (
        typeof record.structureCode === "string" &&
        STRUCTURE_CODE_PATTERN.test(record.structureCode) &&
        catalogueKindForCode(record.structureCode) !== record.structureKind
      )
        issues.push({
          path: `${path}.structureKind`,
          message: `must match the kind of ${record.structureCode}`,
        });
    }
  } else if (op === "enrolled_in_college") {
    const record = exactRecord(value, path, ["op", "college"], issues);
    if (record) requireString(record.college, `${path}.college`, issues);
  } else if (op === "equivalent_course" || op === "external_requirement") {
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

export function validateCourseRequisites(
  record: UnknownRecord,
  issues: CourseExtractionValidationIssue[],
) {
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
    for (const [hardKey, advisoryKey] of [
      ["incompatibilityCourseCodes", "softIncompatibilityCourseCodes"],
      [
        "concurrentIncompatibilityCourseCodes",
        "softConcurrentIncompatibilityCourseCodes",
      ],
    ] as const) {
      for (const key of [hardKey, advisoryKey]) {
        const codes = requisites[key];
        if (Array.isArray(codes) && new Set(codes).size !== codes.length)
          issues.push({
            path: `$.requisites.${key}`,
            message: "must not repeat a course",
          });
      }
      const hard = requisites[hardKey];
      const advisory = requisites[advisoryKey];
      if (Array.isArray(hard) && Array.isArray(advisory)) {
        const overlap = advisory.find((code) => hard.includes(code));
        if (overlap)
          issues.push({
            path: `$.requisites.${advisoryKey}`,
            message: `${overlap} cannot be both a hard and advisory exclusion`,
          });
      }
    }
    requireArray(
      requisites.unmodelledText,
      "$.requisites.unmodelledText",
      issues,
      (item, path) => requireString(item, path, issues),
    );
  }
}
