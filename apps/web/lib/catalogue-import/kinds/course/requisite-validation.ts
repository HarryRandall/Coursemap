import { ENROLMENT_MODES } from "../../../academic/enrolment-mode.ts";
import { validCommencementYearBounds } from "../../../academic/commencement-year.ts";
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

export function validateIncompatibilityRule(
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

export function validateRule(
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
