import type {
  CourseExtractionValidationIssue,
  CourseExtractionValidationOptions,
} from "./contract.ts";
import {
  type UnknownRecord,
  exactRecord,
  requireArray,
  requireNumber,
  requireString,
} from "./validation-helpers.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

export function validateCourseOfferings(
  record: UnknownRecord,
  issues: CourseExtractionValidationIssue[],
  options: CourseExtractionValidationOptions,
) {
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
}
