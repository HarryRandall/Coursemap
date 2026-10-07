import {
  enrolmentModeConditionLabel,
  type EnrolmentMode,
} from "../../../academic/enrolment-mode.ts";
import { commencementYearLabel } from "../../../academic/commencement-year.ts";
import type { WorkloadHoursBasis } from "../../../academic/workload.ts";
import {
  parseCourseExtraction,
  type CourseExtraction,
  type CourseRule,
  type CourseIncompatibilityRule,
} from "./contract.ts";
import { stableFingerprint } from "../../canonical.ts";
import { cleanText } from "./validation-helpers.ts";

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
  | "incompatible_concurrent"
  | "units_total"
  | "subject_units"
  | "subject_courses"
  | "level_units"
  | "course_set_units"
  | "year_standing"
  | "commencement_year"
  | "enrolment_mode"
  | "college_enrolment"
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
  workloadHoursBasis?: WorkloadHoursBasis | null;
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
  minimumCount?: number | null;
  subjectCode: string | null;
  minimumCourseLevel: number | null;
  maximumCourseLevel: number | null;
  minimumGpa: number | null;
  minimumYear: number | null;
  enrolmentMode?: EnrolmentMode | null;
  matchesEnrolmentMode?: boolean | null;
  minimumCommencementYear?: number | null;
  maximumCommencementYear?: number | null;
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

function describeRule(rule: CourseRule | CourseIncompatibilityRule): string {
  switch (rule.op) {
    case "not_completed":
      return `Must not have completed ${rule.courseCode}`;
    case "not_concurrent":
      return `Cannot concurrently enrol in ${rule.courseCode}`;
    case "completed":
      return `Completed ${rule.courseCode}${rule.minimumMark == null ? "" : ` with a mark of at least ${rule.minimumMark}`}`;
    case "completed_or_concurrent":
      return `Completed or concurrently enrolled in ${rule.courseCode}${rule.minimumMark == null ? "" : ` with a mark of at least ${rule.minimumMark}`}`;
    case "all_of":
      return rule.rules.map(describeRule).join(" and ");
    case "one_of":
      return rule.rules.map(describeRule).join(" or ");
    case "min_units_total":
      return `At least ${rule.minimumUnits} units completed`;
    case "min_units_at_level": {
      const subject = rule.subjectCode ? ` from ${rule.subjectCode}` : "";
      const upper = rule.maximumLevel;
      const levels =
        upper === rule.level
          ? `${rule.level}`
          : upper === null || upper === undefined
            ? `${rule.level} or higher`
            : `${rule.level} to ${upper}`;
      return `At least ${rule.minimumUnits} units${subject} at ${levels} level`;
    }
    case "min_units_from_subject":
      return `At least ${rule.minimumUnits} units from ${rule.subjectCode}`;
    case "min_courses_from_subject":
      return `At least ${rule.minimumCount} completed ${rule.subjectCode} ${rule.minimumCount === 1 ? "course" : "courses"}`;
    case "min_units_from_courses":
      return `At least ${rule.minimumUnits} units from ${[...rule.courseCodes]
        .sort((left, right) => left.localeCompare(right))
        .join(", ")}`;
    case "enrolled_in":
      return `Enrolment in programme ${rule.programmeCode}`;
    case "enrolled_in_college":
      return `Enrolment in a programme offered by ${rule.college}`;
    case "external_requirement":
    case "equivalent_course":
      return rule.sourceText;
    case "enrolment_mode":
      return enrolmentModeConditionLabel({
        enrolmentMode: rule.mode,
        matchesEnrolmentMode: rule.matches,
      });
    case "commencement_year":
      return commencementYearLabel({
        minimumCommencementYear: rule.minimumYear,
        maximumCommencementYear: rule.maximumYear,
      });
    case "year_standing":
      return `At least year ${rule.minimumYear} standing`;
    case "minimum_gpa": {
      const scope = rule.recentGradedUnits
        ? ` over the most recent ${rule.recentGradedUnits} graded units`
        : " across the academic career";
      return rule.scale === "anu7"
        ? `Minimum ANU GPA of ${rule.value}${scope}`
        : `Minimum WAM of ${rule.value}${scope}`;
    }
    case "permission":
      return rule.sourceText ?? "Permission required";
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
  rule: CourseRule | CourseIncompatibilityRule,
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
      condition.minimumMark = rule.minimumMark ?? null;
      accumulator.ruleConditions.push(condition);
      addRuleReference(accumulator, ruleKey, rule.courseCode, sourceText);
      return;
    }
    case "not_completed":
    case "not_concurrent": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind:
          rule.op === "not_completed"
            ? "incompatible"
            : "incompatible_concurrent",
        hardness,
        sourceText,
      });
      condition.requiredCourseCode = rule.courseCode;
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
      condition.maximumCourseLevel = rule.maximumLevel ?? null;
      condition.subjectCode = rule.subjectCode ?? null;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "min_courses_from_subject": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "subject_courses",
        hardness,
        sourceText,
      });
      condition.minimumCount = rule.minimumCount;
      condition.subjectCode = rule.subjectCode;
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
    case "enrolled_in_college": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "college_enrolment",
        hardness,
        sourceText,
      });
      condition.freeText = rule.college;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "external_requirement":
    case "equivalent_course": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "other",
        hardness,
        sourceText,
      });
      condition.freeText = rule.sourceText;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "enrolment_mode": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "enrolment_mode",
        hardness,
        sourceText,
      });
      condition.enrolmentMode = rule.mode;
      condition.matchesEnrolmentMode = rule.matches;
      accumulator.ruleConditions.push(condition);
      return;
    }
    case "commencement_year": {
      const condition = emptyCondition({
        key,
        ruleKey,
        groupKey,
        position,
        conditionKind: "commencement_year",
        hardness,
        sourceText,
      });
      condition.minimumCommencementYear = rule.minimumYear;
      condition.maximumCommencementYear = rule.maximumYear;
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
      condition.minimumCount = rule.recentGradedUnits ?? null;
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
  rule: CourseRule | CourseIncompatibilityRule,
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
  hardness = "hard",
}: {
  accumulator: RuleProjectionAccumulator;
  ruleKey: "prerequisite" | "corequisite" | "assumed_knowledge";
  rule: CourseRule | null;
  sourceText: string | null;
  extraText?: readonly string[];
  hardness?: RuleHardness;
}) {
  if (!rule && !sourceText && extraText.length === 0) return;

  const generatedText = rule ? describeRule(rule) : extraText.join("; ");
  const savedSourceText = sourceText ?? generatedText;
  accumulator.rules.push({
    key: ruleKey,
    ruleKind: ruleKey,
    hardness,
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
        hardness,
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
      hardness,
    });
    nextRootPosition = 1;
  } else if (sourceText) {
    const condition = emptyCondition({
      key: `${ruleKey}:condition:raw`,
      ruleKey,
      groupKey: rootKey,
      position: 0,
      conditionKind: "other",
      hardness,
      sourceText,
    });
    condition.freeText = sourceText;
    accumulator.ruleConditions.push(condition);
    nextRootPosition = 1;
  }

  const seenText = new Set(!rule && sourceText ? [cleanText(sourceText)] : []);
  extraText
    .filter((text) => {
      const normalised = cleanText(text);
      if (seenText.has(normalised)) return false;
      seenText.add(normalised);
      return true;
    })
    .forEach((text, index) => {
      const normalised = cleanText(text);
      const condition = emptyCondition({
        key: `${ruleKey}:condition:unmodelled.${index}`,
        ruleKey,
        groupKey: rootKey,
        position: nextRootPosition + index,
        conditionKind: "other",
        hardness,
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
  const scopes = [
    {
      kind: "incompatible" as const,
      hard: extraction.requisites.incompatibilityCourseCodes,
      advisory: extraction.requisites.softIncompatibilityCourseCodes,
    },
    {
      kind: "incompatible_concurrent" as const,
      hard: extraction.requisites.concurrentIncompatibilityCourseCodes ?? [],
      advisory:
        extraction.requisites.softConcurrentIncompatibilityCourseCodes ?? [],
    },
  ];
  const codes = scopes.flatMap(({ kind, hard, advisory }) => {
    assertUniqueStrings(hard, `${kind} hard codes`);
    assertUniqueStrings(advisory, `${kind} advisory codes`);
    const overlap = advisory.find((code) => hard.includes(code));
    if (overlap)
      throw new TypeError(
        `${overlap} cannot be both a hard and advisory ${kind} condition.`,
      );
    return [
      ...[...hard]
        .sort()
        .map((courseCode) => ({ courseCode, hardness: "hard" as const, kind })),
      ...[...advisory].sort().map((courseCode) => ({
        courseCode,
        hardness: "advisory" as const,
        kind,
      })),
    ];
  });
  const rawText = nullableText(extraction.requisites.incompatibilityText);
  const structured = extraction.requisites.incompatibilityRule;
  if (!rawText && codes.length === 0 && !structured) return;

  const ruleKey = "incompatibility" as const;
  accumulator.rules.push({
    key: ruleKey,
    ruleKind: ruleKey,
    hardness:
      structured ||
      codes.some((code) => code.hardness === "hard") ||
      codes.length === 0
        ? "hard"
        : "advisory",
    sourceText:
      rawText ??
      (structured ? describeRule(structured) : null) ??
      codes
        .map(({ courseCode, kind }) =>
          kind === "incompatible_concurrent"
            ? `Cannot concurrently enrol in ${courseCode}`
            : `Incompatible with ${courseCode}`,
        )
        .join("; "),
  });
  const rootKey = `${ruleKey}:group:root`;
  accumulator.ruleGroups.push({
    key: rootKey,
    ruleKey,
    parentGroupKey: null,
    operator:
      structured?.op === "one_of" && codes.length === 0 ? "any_of" : "all_of",
    minimumCount: null,
    position: 0,
  });

  let offset = 0;
  if (structured) {
    const children =
      codes.length === 0 &&
      (structured.op === "all_of" || structured.op === "one_of")
        ? structured.rules
        : [structured];
    children.forEach((child, position) =>
      addRuleNode(child, {
        accumulator,
        ruleKey,
        parentGroupKey: rootKey,
        path: `structured.${position}`,
        position,
        hardness: "hard",
      }),
    );
    offset = children.length;
  }
  codes.forEach(({ courseCode, hardness, kind }, position) => {
    const sourceText =
      rawText ??
      (hardness === "advisory"
        ? `Potential incompatibility with ${courseCode}`
        : kind === "incompatible_concurrent"
          ? `Cannot concurrently enrol in ${courseCode}`
          : `Incompatible with ${courseCode}`);
    const condition = emptyCondition({
      key: `${ruleKey}:condition:${position}`,
      ruleKey,
      groupKey: rootKey,
      position: position + offset,
      conditionKind: kind,
      hardness,
      sourceText,
    });
    condition.requiredCourseCode = courseCode;
    accumulator.ruleConditions.push(condition);
    addRuleReference(accumulator, ruleKey, courseCode, sourceText);
  });

  if (!structured && codes.length === 0 && rawText) {
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
    sourceText:
      !extraction.requisites.prerequisiteRule &&
      (extraction.requisites.incompatibilityCourseCodes.length > 0 ||
        /^(?:N\/A|Not applicable|None)\.?$/iu.test(
          extraction.requisites.prerequisiteText?.trim() ?? "",
        )) &&
      extraction.requisites.unmodelledText.length === 0 &&
      extraction.evidence.some(
        (item) =>
          item.fieldKey === "requisites" &&
          item.method === "deterministic" &&
          item.confidence === 1,
      )
        ? null
        : nullableText(extraction.requisites.prerequisiteText),
    extraText: extraction.requisites.unmodelledText,
  });
  addStructuredRule({
    accumulator,
    ruleKey: "corequisite",
    rule: extraction.requisites.corequisiteRule,
    sourceText: nullableText(extraction.requisites.corequisiteText),
  });
  addStructuredRule({
    accumulator,
    ruleKey: "assumed_knowledge",
    rule: null,
    sourceText: nullableText(
      extraction.requisites.assumedKnowledgeText ?? null,
    ),
    hardness: "advisory",
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
      ...(extraction.workloadHoursBasis
        ? { workloadHoursBasis: extraction.workloadHoursBasis }
        : {}),
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
