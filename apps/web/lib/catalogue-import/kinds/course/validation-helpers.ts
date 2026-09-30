import type { CourseExtractionValidationIssue } from "./contract.ts";

export const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/;

export type UnknownRecord = Record<string, unknown>;

export function cleanText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function exactRecord(
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

export function requireString(
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

export function requireNumber(
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

export function requireBoolean(
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

export function requireEnum(
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

export function requireArray(
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
