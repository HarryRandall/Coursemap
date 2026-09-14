import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
import { parseCourseSnapshotProjection } from "../course-import/snapshot-projection-contract.ts";
import type { AdminCourseYearRecord } from "@/lib/coursemap/admin-course-year";

type SnapshotFields = CourseSnapshotProjectionData["snapshot"];
type AdvancedCollections = Omit<
  CourseSnapshotProjectionData,
  "academicYear" | "courseCode" | "snapshot"
>;

const advancedCollectionKeys = [
  "unitOptions",
  "fees",
  "areasOfInterest",
  "attributes",
  "relatedCourses",
  "courseOffering",
  "offeringSessions",
  "learningOutcomes",
  "assessmentItems",
  "assessmentOutcomes",
  "rules",
  "ruleGroups",
  "ruleConditions",
  "ruleConditionCourses",
  "ruleCourseReferences",
] as const satisfies readonly (keyof AdvancedCollections)[];

const positionedCollectionKeys = [
  "unitOptions",
  "fees",
  "areasOfInterest",
  "attributes",
  "relatedCourses",
  "offeringSessions",
  "learningOutcomes",
  "assessmentItems",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function advancedCollections(
  projection: CourseSnapshotProjectionData,
): AdvancedCollections {
  return Object.fromEntries(
    advancedCollectionKeys.map((key) => [key, projection[key]]),
  ) as AdvancedCollections;
}

export function collectionEditorValue(
  projection: CourseSnapshotProjectionData,
) {
  return JSON.stringify(advancedCollections(projection), null, 2);
}

function validatePositions(label: string, rows: unknown[], firstPosition = 1) {
  const positions = rows.map((row) =>
    isRecord(row) && Number.isInteger(row.position)
      ? Number(row.position)
      : NaN,
  );
  if (positions.some((position) => !Number.isInteger(position))) {
    throw new TypeError(`${label} requires an integer position on every row.`);
  }
  if (new Set(positions).size !== positions.length) {
    throw new TypeError(`${label} contains duplicate positions.`);
  }
  const ordered = [...positions].sort((left, right) => left - right);
  if (ordered.some((position, index) => position !== firstPosition + index)) {
    throw new TypeError(
      `${label} positions must run from ${firstPosition} without gaps.`,
    );
  }
}

function parseAdvancedCollections(value: string): AdvancedCollections {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new TypeError(
      error instanceof Error ? error.message : "The JSON is not valid.",
    );
  }
  if (!isRecord(parsed)) {
    throw new TypeError("Advanced collections must be one JSON object.");
  }
  const keys = Object.keys(parsed).sort();
  const expectedKeys = [...advancedCollectionKeys].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError(
      `Keep exactly these collection keys: ${advancedCollectionKeys.join(", ")}.`,
    );
  }
  for (const key of advancedCollectionKeys) {
    if (key === "courseOffering") {
      if (parsed[key] !== null && !isRecord(parsed[key])) {
        throw new TypeError("courseOffering must be an object or null.");
      }
    } else if (!Array.isArray(parsed[key])) {
      throw new TypeError(`${key} must be a JSON array.`);
    }
  }
  for (const key of positionedCollectionKeys) {
    validatePositions(key, parsed[key] as unknown[]);
  }

  const rules = parsed.rules as unknown[];
  const ruleKeys = new Set(
    rules.map((rule) => (isRecord(rule) ? rule.key : undefined)),
  );
  if (ruleKeys.has(undefined) || ruleKeys.size !== rules.length) {
    throw new TypeError("Every rule requires a unique key.");
  }
  const groups = parsed.ruleGroups as unknown[];
  const groupKeys = new Set(
    groups.map((group) => (isRecord(group) ? group.key : undefined)),
  );
  if (groupKeys.has(undefined) || groupKeys.size !== groups.length) {
    throw new TypeError("Every rule group requires a unique key.");
  }
  for (const group of groups) {
    if (
      !isRecord(group) ||
      !ruleKeys.has(group.ruleKey) ||
      (group.parentGroupKey !== null && !groupKeys.has(group.parentGroupKey))
    ) {
      throw new TypeError(
        "Every rule group must reference an existing rule and parent group.",
      );
    }
  }
  const conditions = parsed.ruleConditions as unknown[];
  const conditionKeys = new Set(
    conditions.map((condition) =>
      isRecord(condition) ? condition.key : undefined,
    ),
  );
  if (
    conditionKeys.has(undefined) ||
    conditionKeys.size !== conditions.length
  ) {
    throw new TypeError("Every rule condition requires a unique key.");
  }
  for (const condition of conditions) {
    if (
      !isRecord(condition) ||
      !ruleKeys.has(condition.ruleKey) ||
      !groupKeys.has(condition.groupKey)
    ) {
      throw new TypeError(
        "Every rule condition must reference an existing rule and group.",
      );
    }
  }
  for (const member of parsed.ruleConditionCourses as unknown[]) {
    if (!isRecord(member) || !conditionKeys.has(member.conditionKey)) {
      throw new TypeError(
        "Every condition course must reference an existing condition.",
      );
    }
  }
  for (const reference of parsed.ruleCourseReferences as unknown[]) {
    if (!isRecord(reference) || !ruleKeys.has(reference.ruleKey)) {
      throw new TypeError(
        "Every course reference must reference an existing rule.",
      );
    }
  }

  const outcomePositions = new Set(
    (parsed.learningOutcomes as unknown[]).map((row) =>
      isRecord(row) ? row.position : undefined,
    ),
  );
  const assessmentPositions = new Set(
    (parsed.assessmentItems as unknown[]).map((row) =>
      isRecord(row) ? row.position : undefined,
    ),
  );
  for (const link of parsed.assessmentOutcomes as unknown[]) {
    if (
      !isRecord(link) ||
      !assessmentPositions.has(link.assessmentPosition) ||
      !outcomePositions.has(link.learningOutcomePosition)
    ) {
      throw new TypeError(
        "Every assessment outcome link must reference saved assessment and learning outcome positions.",
      );
    }
  }
  return parsed as unknown as AdvancedCollections;
}

function validateUnitValue(
  snapshot: SnapshotFields,
  collections: AdvancedCollections,
) {
  if (snapshot.unitValueKind === "fixed") {
    if (snapshot.units === null || collections.unitOptions.length > 0) {
      throw new TypeError(
        "Fixed units require one units value and no unit options.",
      );
    }
    return;
  }
  if (snapshot.unitValueKind === "range") {
    if (
      snapshot.units !== null ||
      snapshot.minimumUnits === null ||
      snapshot.maximumUnits === null ||
      snapshot.maximumUnits < snapshot.minimumUnits ||
      collections.unitOptions.length > 0
    ) {
      throw new TypeError(
        "A unit range requires minimum and maximum units, with no fixed units or options.",
      );
    }
    return;
  }
  if (snapshot.unitValueKind === "variable") {
    const optionUnits = collections.unitOptions.map((option) => option.units);
    if (
      snapshot.units !== null ||
      optionUnits.length === 0 ||
      snapshot.minimumUnits !== Math.min(...optionUnits) ||
      snapshot.maximumUnits !== Math.max(...optionUnits)
    ) {
      throw new TypeError(
        "Variable units require unit options and matching minimum and maximum units.",
      );
    }
    return;
  }
  if (
    snapshot.units !== null ||
    snapshot.minimumUnits !== null ||
    snapshot.maximumUnits !== null ||
    collections.unitOptions.length > 0
  ) {
    throw new TypeError(
      "Unknown units cannot include fixed, minimum, maximum or option values.",
    );
  }
}

export function preparedProjection(
  record: AdminCourseYearRecord,
  snapshot: SnapshotFields,
  collectionJson: string,
) {
  const collections = parseAdvancedCollections(collectionJson);
  validateUnitValue(snapshot, collections);
  for (const session of collections.offeringSessions) {
    if (session.calendarYear !== record.year) {
      throw new TypeError(
        `Every offering session must belong to the selected ${record.year} course year.`,
      );
    }
  }
  if (!snapshot.title.trim()) throw new TypeError("Course title is required.");
  if (!/^[A-Z]{4}$/.test(snapshot.subjectCode)) {
    throw new TypeError("Subject code must contain four uppercase letters.");
  }
  if (!Number.isInteger(snapshot.level) || snapshot.level < 0) {
    throw new TypeError("Course level must be a non-negative whole number.");
  }
  return parseCourseSnapshotProjection({
    courseCode: record.code,
    academicYear: record.year,
    snapshot,
    ...collections,
  });
}
