import {
  parseCourseExtraction,
  type CourseExtraction,
  type CourseRule,
} from "./contract.ts";
import { stableFingerprint } from "../../canonical.ts";

type RuleKind =
  | "prerequisite"
  | "corequisite"
  | "incompatibility"
  | "permission"
  | "assumed_knowledge";
type RuleHardness = "hard" | "advisory";
type GroupOperator = "all_of" | "any_of" | "at_least";
type CourseRequirementMode = "completed" | "completed_or_concurrent";
type ConditionKind =
  | "course"
  | "incompatible"
  | "units_total"
  | "subject_units"
  | "level_units"
  | "course_set_units"
  | "year_standing"
  | "permission"
  | "admission"
  | "gpa"
  | "wam"
  | "other";

export type ProjectedCourseSnapshotRow = {
  title: string;
  unitValueKind: CourseExtraction["unitValue"]["kind"];
  units: number | null;
  minimumUnits: number | null;
  maximumUnits: number | null;
  eftsl: number | null;
  level: number;
  subjectCode: string;
  subjectName: string | null;
  school: string | null;
  college: string | null;
  academicCareer: CourseExtraction["academicCareer"];
  convenerText: string | null;
  deliverySummary: string | null;
  introduction: string | null;
  description: string | null;
  workloadText: string | null;
  workloadHours: number | null;
  inherentRequirements: string | null;
  prescribedTexts: string | null;
  offeringStatus: CourseExtraction["offeringStatus"];
  sourceUpdatedAt: string | null;
};

export type ProjectedCourseRuleRow = {
  key: RuleKind;
  ruleKind: RuleKind;
  hardness: RuleHardness;
  sourceText: string;
};

export type ProjectedCourseRuleGroupRow = {
  key: string;
  ruleKey: RuleKind;
  parentGroupKey: string | null;
  operator: GroupOperator;
  minimumCount: number | null;
  position: number;
};

export type ProjectedCourseRuleConditionRow = {
  key: string;
  ruleKey: RuleKind;
  groupKey: string;
  position: number;
  conditionKind: ConditionKind;
  requiredCourseCode: string | null;
  requiredStructureCode: string | null;
  minimumUnits: number | null;
  minimumMark: number | null;
  subjectCode: string | null;
  minimumCourseLevel: number | null;
  maximumCourseLevel: number | null;
  minimumGpa: number | null;
  minimumYear: number | null;
  minimumWam: number | null;
  freeText: string | null;
  courseRequirementMode: CourseRequirementMode | null;
  hardness: RuleHardness;
  sourceText: string;
};

export type CourseSnapshotProjectionData = {
  courseCode: string;
  academicYear: number;
  snapshot: ProjectedCourseSnapshotRow;
  unitOptions: Array<{
    position: number;
    units: number;
    label: string | null;
    sourceText: string;
  }>;
  fees: Array<{
    position: number;
    feeYear: number | null;
    audience: CourseExtraction["fees"][number]["audience"];
    feeType: CourseExtraction["fees"][number]["feeType"];
    amount: number | null;
    currency: string | null;
    basis: CourseExtraction["fees"][number]["basis"];
    studentContributionBand: number | null;
    sourceLabel: string | null;
    sourceText: string;
  }>;
  areasOfInterest: Array<{ position: number; name: string }>;
  tags: Array<{ position: number; name: string }>;
  attributes: Array<{
    position: number;
    attributeKind: CourseExtraction["attributes"][number]["attributeKind"];
    value: string;
    sourceText: string;
  }>;
  relatedCourses: Array<{
    position: number;
    relationKind: CourseExtraction["relatedCourses"][number]["relationKind"];
    sourceCourseCode: string;
    sourceCourseTitle: string | null;
    sourceText: string;
  }>;
  courseOffering: {
    deliveryMode: string | null;
    location: string | null;
  } | null;
  offeringSessions: Array<{
    position: number;
    calendarYear: number;
    academicPeriodCode: string;
    academicPeriodName: string;
    classNumber: string | null;
    startsOn: string | null;
    enrolClosesOn: string | null;
    censusOn: string | null;
    endsOn: string | null;
    deliveryMode: string | null;
    location: string | null;
    classSummaryUrl: string | null;
    sourceText: string;
  }>;
  learningOutcomes: Array<{ position: number; body: string }>;
  assessmentItems: Array<{
    position: number;
    title: string;
    weight: number | null;
    hurdle: boolean | null;
    dueText: string | null;
    sourceText: string;
  }>;
  assessmentOutcomes: Array<{
    assessmentPosition: number;
    learningOutcomePosition: number;
  }>;
  rules: ProjectedCourseRuleRow[];
  ruleGroups: ProjectedCourseRuleGroupRow[];
  ruleConditions: ProjectedCourseRuleConditionRow[];
  ruleConditionCourses: Array<{
    conditionKey: string;
    position: number;
    sourceCourseCode: string;
    sourceText: string;
  }>;
  ruleCourseReferences: Array<{
    ruleKey: RuleKind;
    referencedCourseCode: string;
    sourceText: string;
  }>;
};

export type CourseSnapshotProjection = CourseSnapshotProjectionData & {
  projectionSha256: string;
};

type RuleProjectionAccumulator = Pick<
  CourseSnapshotProjectionData,
  | "rules"
  | "ruleGroups"
  | "ruleConditions"
  | "ruleConditionCourses"
  | "ruleCourseReferences"
>;

function cleanText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nullableText(value: string | null) {
  return value === null ? null : cleanText(value);
}

function rowsByPosition<T extends { position: number }>(
  rows: readonly T[],
  label: string,
) {
  const output = rows.map((row) => structuredClone(row));
  const positions = new Set<number>();
  for (const row of output) {
    if (positions.has(row.position)) {
      throw new TypeError(
        `${label} contains duplicate position ${row.position}.`,
      );
    }
    positions.add(row.position);
  }
  return output.sort((left, right) => left.position - right.position);
}

function assertUniqueStrings(values: readonly string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new TypeError(`${label} contains duplicate value ${value}.`);
    }
    seen.add(value);
  }
}

function describeRule(rule: CourseRule): string {
  switch (rule.op) {
    case "completed":
      return `Completed ${rule.courseCode}`;
    case "completed_or_concurrent":
      return `Completed or concurrently enrolled in ${rule.courseCode}`;
    case "all_of":
      return rule.rules.map(describeRule).join(" and ");
    case "one_of":
      return rule.rules.map(describeRule).join(" or ");
    case "min_units_total":
      return `At least ${rule.minimumUnits} units completed`;
    case "min_units_at_level":
      return `At least ${rule.minimumUnits} units at ${rule.level} level`;
    case "min_units_from_subject":
      return `At least ${rule.minimumUnits} units from ${rule.subjectCode}`;
    case "min_units_from_courses":
      return `At least ${rule.minimumUnits} units from ${[...rule.courseCodes]
        .sort((left, right) => left.localeCompare(right))
        .join(", ")}`;
    case "enrolled_in":
      return `Enrolment in programme ${rule.programmeCode}`;
    case "year_standing":
      return `At least year ${rule.minimumYear} standing`;
    case "minimum_gpa":
      return rule.scale === "anu7"
        ? `Minimum ANU GPA of ${rule.value}`
        : `Minimum WAM of ${rule.value}`;
    case "permission":
      return "Permission of the course convener";
  }
}

function emptyCondition({
  key,
  ruleKey,
  groupKey,
  position,
  conditionKind,
  hardness,
  sourceText,
}: {
  key: string;
  ruleKey: RuleKind;
  groupKey: string;
  position: number;
  conditionKind: ConditionKind;
  hardness: RuleHardness;
  sourceText: string;
}): ProjectedCourseRuleConditionRow {
  return {
    key,
    ruleKey,
    groupKey,
    position,
    conditionKind,
    requiredCourseCode: null,
    requiredStructureCode: null,
    minimumUnits: null,
    minimumMark: null,
    subjectCode: null,
    minimumCourseLevel: null,
    maximumCourseLevel: null,
    minimumGpa: null,
    minimumYear: null,
    minimumWam: null,
    freeText: null,
    courseRequirementMode: null,
    hardness,
    sourceText,
  };
}

function addRuleReference(
  accumulator: RuleProjectionAccumulator,
  ruleKey: RuleKind,
  courseCode: string,
  sourceText: string,
) {
  if (
    accumulator.ruleCourseReferences.some(
      (reference) =>
        reference.ruleKey === ruleKey &&
        reference.referencedCourseCode === courseCode,
    )
  ) {
    return;
  }
  accumulator.ruleCourseReferences.push({
    ruleKey,
    referencedCourseCode: courseCode,
    sourceText,
  });
}

function addAtomicRule(
  rule: CourseRule,
  context: {
    accumulator: RuleProjectionAccumulator;
    ruleKey: RuleKind;
    groupKey: string;
    path: string;
    position: number;
    hardness: RuleHardness;
  },
) {
  const { accumulator, ruleKey, groupKey, path, position, hardness } = context;
  const key = `${ruleKey}:condition:${path}`;
  const sourceText = describeRule(rule);

  const requirePositiveUnits = (units: number) => {
    if (units <= 0) {
      throw new TypeError(`${key} must require more than zero units.`);
    }
  };

  switch (rule.op) {
    case "all_of":
    case "one_of":
      throw new TypeError(`${rule.op} must be projected as a rule group.`);
    case "completed":
    case "completed_or_concurrent": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "course",
        hardness,
        sourceText,
      });
      condition.requiredCourseCode = rule.courseCode;
      condition.courseRequirementMode = rule.op;
      accumulator.ruleConditions.push(condition);
      addRuleReference(accumulator, ruleKey, rule.courseCode, sourceText);
      return;
    }
    case "min_units_total": {
      requirePositiveUnits(rule.minimumUnits);
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "units_total",
        hardness,
        sourceText,
      });
      condition.minimumUnits = rule.minimumUnits;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "min_units_at_level": {
      requirePositiveUnits(rule.minimumUnits);
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "level_units",
        hardness,
        sourceText,
      });
      condition.minimumUnits = rule.minimumUnits;
      condition.minimumCourseLevel = rule.level;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "min_units_from_subject": {
      requirePositiveUnits(rule.minimumUnits);
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "subject_units",
        hardness,
        sourceText,
      });
      condition.minimumUnits = rule.minimumUnits;
      condition.subjectCode = rule.subjectCode;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "min_units_from_courses": {
      requirePositiveUnits(rule.minimumUnits);
      if (rule.courseCodes.length === 0) {
        throw new TypeError(`${key} must contain at least one course.`);
      }
      assertUniqueStrings(rule.courseCodes, `${key} course set`);
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "course_set_units",
        hardness,
        sourceText,
      });
      condition.minimumUnits = rule.minimumUnits;
      accumulator.ruleConditions.push(condition);
      [...rule.courseCodes]
        .sort((left, right) => left.localeCompare(right))
        .forEach((courseCode, index) => {
          accumulator.ruleConditionCourses.push({
            conditionKey: key,
            position: index + 1,
            sourceCourseCode: courseCode,
            sourceText,
          });
          addRuleReference(accumulator, ruleKey, courseCode, sourceText);
        });
      return;
    }
    case "enrolled_in": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "admission",
        hardness,
        sourceText,
      });
      condition.requiredStructureCode = rule.programmeCode;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "year_standing": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "year_standing",
        hardness,
        sourceText,
      });
      condition.minimumYear = rule.minimumYear;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "minimum_gpa": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: rule.scale === "anu7" ? "gpa" : "wam",
        hardness,
        sourceText,
      });
      if (rule.scale === "anu7") condition.minimumGpa = rule.value;
      else condition.minimumWam = rule.value;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "permission": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "permission",
        hardness,
        sourceText,
      });
      condition.freeText = sourceText;
      accumulator.ruleConditions.push(condition);
    }
  }
}

function addRuleNode(
  rule: CourseRule,
  context: {
    accumulator: RuleProjectionAccumulator;
    ruleKey: RuleKind;
    parentGroupKey: string;
    path: string;
    position: number;
    hardness: RuleHardness;
  },
) {
  if (rule.op !== "all_of" && rule.op !== "one_of") {
    addAtomicRule(rule, {
      ...context,
      groupKey: context.parentGroupKey,
    });
    return;
  }

  const groupKey = `${context.ruleKey}:group:${context.path}`;
  context.accumulator.ruleGroups.push({
    key: groupKey,
    ruleKey: context.ruleKey,
    parentGroupKey: context.parentGroupKey,
    operator: rule.op === "all_of" ? "all_of" : "any_of",
    minimumCount: null,
    position: context.position,
  });
  rule.rules.forEach((child, index) =>
    addRuleNode(child, {
      ...context,
      parentGroupKey: groupKey,
      path: `${context.path}.${index}`,
      position: index,
    }),
  );
}

function addStructuredRule({
  accumulator,
  ruleKey,
  rule,
  sourceText,
  extraText = [],
}: {
  accumulator: RuleProjectionAccumulator;
  ruleKey: "prerequisite" | "corequisite";
  rule: CourseRule | null;
  sourceText: string | null;
  extraText?: readonly string[];
}) {
  if (!rule && !sourceText && extraText.length === 0) return;

  const generatedText = rule ? describeRule(rule) : extraText.join("; ");
  const savedSourceText = sourceText ?? generatedText;
  accumulator.rules.push({
    key: ruleKey,
    ruleKind: ruleKey,
    hardness: "hard",
    sourceText: savedSourceText,
  });
  const rootKey = `${ruleKey}:group:root`;
  const rootOperator = rule?.op === "one_of" ? "any_of" : "all_of";
  accumulator.ruleGroups.push({
    key: rootKey,
    ruleKey,
    parentGroupKey: null,
    operator: rootOperator,
    minimumCount: null,
    position: 0,
  });

  let nextRootPosition = 0;
  if (rule?.op === "all_of" || rule?.op === "one_of") {
    rule.rules.forEach((child, index) =>
      addRuleNode(child, {
        accumulator,
        ruleKey,
        parentGroupKey: rootKey,
        path: String(index),
        position: index,
        hardness: "hard",
      }),
    );
    nextRootPosition = rule.rules.length;
  } else if (rule) {
    addAtomicRule(rule, {
      accumulator,
      ruleKey,
      groupKey: rootKey,
      path: "0",
      position: 0,
      hardness: "hard",
    });
    nextRootPosition = 1;
  } else if (sourceText) {
    const condition = emptyCondition({
      key: `${ruleKey}:condition:raw`,
      ruleKey,
      groupKey: rootKey,
      position: 0,
      conditionKind: "other",
      hardness: "hard",
      sourceText,
    });
    condition.freeText = sourceText;
    accumulator.ruleConditions.push(condition);
    nextRootPosition = 1;
  }

  extraText.forEach((text, index) => {
    const normalised = cleanText(text);
    const condition = emptyCondition({
      key: `${ruleKey}:condition:unmodelled.${index}`,
      ruleKey,
      groupKey: rootKey,
      position: nextRootPosition + index,
      conditionKind: "other",
      hardness: "hard",
      sourceText: normalised,
    });
    condition.freeText = normalised;
    accumulator.ruleConditions.push(condition);
  });
}

function addIncompatibilityRule(
  extraction: CourseExtraction,
  accumulator: RuleProjectionAccumulator,
) {
  const hardCodes = [...extraction.requisites.incompatibilityCourseCodes].sort(
    (left, right) => left.localeCompare(right),
  );
  const advisoryCodes = [
    ...extraction.requisites.softIncompatibilityCourseCodes,
  ].sort((left, right) => left.localeCompare(right));
  assertUniqueStrings(hardCodes, "hard incompatibility codes");
  assertUniqueStrings(advisoryCodes, "advisory incompatibility codes");
  const hardSet = new Set(hardCodes);
  const duplicate = advisoryCodes.find((code) => hardSet.has(code));
  if (duplicate) {
    throw new TypeError(
      `${duplicate} cannot be both a hard and advisory incompatibility.`,
    );
  }
  const rawText = nullableText(extraction.requisites.incompatibilityText);
  if (!rawText && hardCodes.length === 0 && advisoryCodes.length === 0) return;

  const ruleKey = "incompatibility" as const;
  accumulator.rules.push({
    key: ruleKey,
    ruleKind: ruleKey,
    hardness:
      hardCodes.length > 0 || advisoryCodes.length === 0 ? "hard" : "advisory",
    sourceText:
      rawText ??
      `Incompatible with ${[...hardCodes, ...advisoryCodes].join(", ")}`,
  });
  const rootKey = `${ruleKey}:group:root`;
  accumulator.ruleGroups.push({
    key: rootKey,
    ruleKey,
    parentGroupKey: null,
    operator: "all_of",
    minimumCount: null,
    position: 0,
  });

  const codes = [
    ...hardCodes.map((courseCode) => ({
      courseCode,
      hardness: "hard" as const,
    })),
    ...advisoryCodes.map((courseCode) => ({
      courseCode,
      hardness: "advisory" as const,
    })),
  ];
  codes.forEach(({ courseCode, hardness }, position) => {
    const sourceText =
      rawText ??
      (hardness === "advisory"
        ? `Potential incompatibility with ${courseCode}`
        : `Incompatible with ${courseCode}`);
    const condition = emptyCondition({
      key: `${ruleKey}:condition:${position}`,
      ruleKey,
      groupKey: rootKey,
      position,
      conditionKind: "incompatible",
      hardness,
      sourceText,
    });
    condition.requiredCourseCode = courseCode;
    accumulator.ruleConditions.push(condition);
    addRuleReference(accumulator, ruleKey, courseCode, sourceText);
  });

  if (codes.length === 0 && rawText) {
    const condition = emptyCondition({
      key: `${ruleKey}:condition:raw`,
      ruleKey,
      groupKey: rootKey,
      position: 0,
      conditionKind: "other",
      hardness: "hard",
      sourceText: rawText,
    });
    condition.freeText = rawText;
    accumulator.ruleConditions.push(condition);
  }
}

function projectRules(extraction: CourseExtraction): RuleProjectionAccumulator {
  const accumulator: RuleProjectionAccumulator = {
    rules: [],
    ruleGroups: [],
    ruleConditions: [],
    ruleConditionCourses: [],
    ruleCourseReferences: [],
  };
  addStructuredRule({
    accumulator,
    ruleKey: "prerequisite",
    rule: extraction.requisites.prerequisiteRule,
    sourceText: nullableText(extraction.requisites.prerequisiteText),
    extraText: extraction.requisites.unmodelledText,
  });
  addStructuredRule({
    accumulator,
    ruleKey: "corequisite",
    rule: extraction.requisites.corequisiteRule,
    sourceText: nullableText(extraction.requisites.corequisiteText),
  });
  addIncompatibilityRule(extraction, accumulator);
  accumulator.ruleCourseReferences = accumulator.ruleCourseReferences.filter(
    ({ referencedCourseCode }) => referencedCourseCode !== extraction.code,
  );
  accumulator.ruleCourseReferences.sort(
    (left, right) =>
      left.ruleKey.localeCompare(right.ruleKey) ||
      left.referencedCourseCode.localeCompare(right.referencedCourseCode),
  );
  return accumulator;
}

function projectUnitValue(unitValue: CourseExtraction["unitValue"]): {
  snapshot: Pick<
    ProjectedCourseSnapshotRow,
    "unitValueKind" | "units" | "minimumUnits" | "maximumUnits"
  >;
  options: CourseSnapshotProjectionData["unitOptions"];
} {
  if (unitValue.kind === "fixed") {
    return {
      snapshot: {
        unitValueKind: "fixed",
        units: unitValue.units,
        minimumUnits: null,
        maximumUnits: null,
      },
      options: [],
    };
  }
  if (unitValue.kind === "range") {
    return {
      snapshot: {
        unitValueKind: "range",
        units: null,
        minimumUnits: unitValue.minimumUnits,
        maximumUnits: unitValue.maximumUnits,
      },
      options: [],
    };
  }
  if (unitValue.kind === "variable") {
    assertUniqueStrings(
      unitValue.unitsOptions.map(String),
      "variable unit options",
    );
    const units = [...unitValue.unitsOptions].sort(
      (left, right) => left - right,
    );
    if (units.some((value) => value <= 0)) {
      throw new TypeError(
        "Variable course unit options must be greater than zero.",
      );
    }
    return {
      snapshot: {
        unitValueKind: "variable",
        units: null,
        minimumUnits: units[0] ?? null,
        maximumUnits: units.at(-1) ?? null,
      },
      options: units.map((value, index) => ({
        position: index + 1,
        units: value,
        label: `${value} units`,
        sourceText: `${value} units`,
      })),
    };
  }
  return {
    snapshot: {
      unitValueKind: "unknown",
      units: null,
      minimumUnits: null,
      maximumUnits: null,
    },
    options: [],
  };
}

function projectionHash(data: CourseSnapshotProjectionData) {
  const semanticData = structuredClone(data);
  // ANU's update stamp is useful provenance but is not a course-data change.
  semanticData.snapshot.sourceUpdatedAt = null;
  return stableFingerprint(semanticData);
}

/**
 * Converts a validated extraction into natural-key relational rows. Database
 * identifiers, provenance, confidence and review state are deliberately left
 * for the transactional writer and are not part of the semantic hash.
 */
export function projectCourseSnapshot(
  value: CourseExtraction,
): CourseSnapshotProjection {
  const extraction = parseCourseExtraction(value, {
    expectedCode: value.code,
    expectedYear: value.year,
  });
  for (const offering of extraction.offerings) {
    if (offering.calendarYear !== extraction.year) {
      throw new TypeError(
        `Offering position ${offering.position} belongs to ${offering.calendarYear}, not extraction year ${extraction.year}.`,
      );
    }
  }

  const unitValue = projectUnitValue(extraction.unitValue);
  const fees = rowsByPosition(extraction.fees, "fees").map((fee) => ({
    ...fee,
    currency: nullableText(fee.currency),
    sourceLabel: nullableText(fee.sourceLabel),
    sourceText: cleanText(fee.sourceText),
  }));
  const areasOfInterest = extraction.areasOfInterest.map((name, index) => ({
    position: index + 1,
    name: cleanText(name),
  }));
  assertUniqueStrings(
    areasOfInterest.map(({ name }) => name),
    "areas of interest",
  );
  // A tag is one category however it is capitalised, so a repeat collapses
  // into the first spelling given.
  const seenTags = new Set<string>();
  const tags = (extraction.tags ?? [])
    .map((name) => cleanText(name))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    })
    .map((name, index) => ({ position: index + 1, name }));
  const attributes = rowsByPosition(extraction.attributes, "attributes").map(
    (attribute) => ({
      ...attribute,
      value: cleanText(attribute.value),
      sourceText: cleanText(attribute.sourceText),
    }),
  );
  assertUniqueStrings(
    attributes.map(
      ({ attributeKind, value }) => `${attributeKind}\u0000${value}`,
    ),
    "attributes",
  );
  const relatedCourses = rowsByPosition(
    extraction.relatedCourses,
    "related courses",
  ).map((related) => ({
    position: related.position,
    relationKind: related.relationKind,
    sourceCourseCode: related.courseCode,
    sourceCourseTitle: nullableText(related.courseTitle),
    sourceText: cleanText(related.sourceText),
  }));
  assertUniqueStrings(
    relatedCourses.map(
      ({ relationKind, sourceCourseCode }) =>
        `${relationKind}\u0000${sourceCourseCode}`,
    ),
    "related courses",
  );

  const offeringSessions = rowsByPosition(
    extraction.offerings,
    "offering sessions",
  ).map((offering) => ({
    position: offering.position,
    calendarYear: offering.calendarYear,
    academicPeriodCode: cleanText(offering.periodCode),
    academicPeriodName: cleanText(offering.periodName),
    classNumber: nullableText(offering.classNumber),
    startsOn: offering.startsOn,
    enrolClosesOn: offering.lastEnrolmentDate,
    censusOn: offering.censusDate,
    endsOn: offering.endsOn,
    deliveryMode: nullableText(offering.deliveryMode),
    location: nullableText(offering.location),
    classSummaryUrl: nullableText(offering.classSummaryUrl),
    sourceText: cleanText(offering.sourceText),
  }));
  assertUniqueStrings(
    offeringSessions.map(
      ({ academicPeriodCode, classNumber }) =>
        `${academicPeriodCode}\u0000${classNumber ?? ""}`,
    ),
    "offering session natural keys",
  );

  const learningOutcomes = rowsByPosition(
    extraction.learningOutcomes,
    "learning outcomes",
  ).map((outcome) => ({
    position: outcome.position,
    body: cleanText(outcome.text),
  }));
  const learningOutcomePositions = new Set(
    learningOutcomes.map(({ position }) => position),
  );
  const assessmentSource = rowsByPosition(
    extraction.assessmentItems,
    "assessment items",
  );
  const assessmentItems = assessmentSource.map((assessment) => ({
    position: assessment.position,
    title: cleanText(assessment.title),
    weight: assessment.weight,
    hurdle: assessment.hurdle,
    dueText: nullableText(assessment.dueText),
    sourceText: cleanText(assessment.sourceText),
  }));
  const assessmentOutcomes = assessmentSource.flatMap((assessment) => {
    assertUniqueStrings(
      assessment.learningOutcomePositions.map(String),
      `assessment position ${assessment.position} outcome links`,
    );
    return [...assessment.learningOutcomePositions]
      .sort((left, right) => left - right)
      .map((learningOutcomePosition) => {
        if (!learningOutcomePositions.has(learningOutcomePosition)) {
          throw new TypeError(
            `Assessment position ${assessment.position} references missing learning outcome position ${learningOutcomePosition}.`,
          );
        }
        return {
          assessmentPosition: assessment.position,
          learningOutcomePosition,
        };
      });
  });

  const rules = projectRules(extraction);
  const data: CourseSnapshotProjectionData = {
    courseCode: extraction.code,
    academicYear: extraction.year,
    snapshot: {
      title: cleanText(extraction.title),
      ...unitValue.snapshot,
      eftsl: extraction.eftsl,
      level: extraction.level,
      subjectCode: extraction.subjectCode,
      subjectName: nullableText(extraction.subjectName),
      school: nullableText(extraction.school),
      college: nullableText(extraction.college),
      academicCareer: extraction.academicCareer,
      convenerText: nullableText(extraction.convenerText),
      deliverySummary: nullableText(extraction.deliverySummary),
      introduction: nullableText(extraction.introduction),
      description: nullableText(extraction.description),
      workloadText: nullableText(extraction.workloadText),
      workloadHours: extraction.workloadHours,
      inherentRequirements: nullableText(extraction.inherentRequirements),
      prescribedTexts: nullableText(extraction.prescribedTexts),
      offeringStatus: extraction.offeringStatus,
      sourceUpdatedAt: extraction.sourceUpdatedAt,
    },
    unitOptions: unitValue.options,
    fees,
    areasOfInterest,
    tags,
    attributes,
    relatedCourses,
    courseOffering:
      offeringSessions.length > 0
        ? { deliveryMode: null, location: null }
        : null,
    offeringSessions,
    learningOutcomes,
    assessmentItems,
    assessmentOutcomes,
    ...rules,
  };
  return { ...data, projectionSha256: projectionHash(data) };
}

// Kept as the worker-facing name because the projection is assembled before
// any database identifiers are resolved.
export const buildCourseSnapshotProjection = projectCourseSnapshot;
