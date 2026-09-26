import {
  PUBLISHED_COURSE_DETAIL_TAG,
  PUBLISHED_COURSE_PAGE_TAG,
  PUBLISHED_COURSE_YEARS_TAG,
  publishedCourseTag,
  publishedCourseYearTag,
} from "./published-cache";
import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public-server";
import type { Database, Json } from "@/types/database";
import type {
  CourseAssessment,
  CourseAttribute,
  CourseDetails,
  CourseFee,
  CourseOffering,
  CoursePrerequisiteEdge,
  CourseRelatedCourse,
  CourseRequisiteRule,
  CourseRuleExpression,
  CourseUnitValue,
} from "./course-types";
import { accentFor } from "@/lib/coursemap/course-accent";
import type { RequisiteExpression } from "./requisite-summary";

const ANU_SOURCE_BASE_URL = "https://programsandcourses.anu.edu.au";
const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;

type AcademicYearRow = { id: number; year: number };
type CourseIdentityRow = { id: number; code: string };
type SnapshotListRow = {
  academic_career: string | null;
  code: string;
  college: string | null;
  convener_text: string | null;
  delivery_summary: string | null;
  description: string | null;
  eftsl: number | null;
  inherent_requirements: string | null;
  introduction: string | null;
  level: number | null;
  maximum_units: number | null;
  minimum_units: number | null;
  offering_status: string;
  prescribed_texts: string | null;
  school: string | null;
  version_id: number;
  source_updated_at: string | null;
  subject_code: string | null;
  subject_name: string | null;
  title: string;
  unit_value_kind: string;
  units: number | null;
  workload_hours: number | null;
  workload_text: string | null;
};
type OfferingRow = {
  version_id: number;
  delivery_mode: string | null;
  id: number;
  location: string | null;
};
type OfferingSessionRow = {
  academic_period_code: string | null;
  academic_period_name: string | null;
  census_on: string | null;
  class_number: string | null;
  class_summary_url: string | null;
  course_offering_id: number;
  version_id: number | null;
  delivery_mode: string | null;
  ends_on: string | null;
  enrol_closes_on: string | null;
  location: string | null;
  position: number | null;
  starts_on: string | null;
};
type RuleRow = {
  confidence: number;
  version_id: number | null;
  id: number;
  review_state: string;
  rule_kind: string;
  source_text: string;
};
type RuleReferenceRow = {
  rule_id: number;
  code_id: number;
};
type RuleConditionRow = {
  rule_id: number;
  code_id: number | null;
};

const SNAPSHOT_LIST_SELECT =
  "version_id,code,title,unit_value_kind,units,minimum_units,maximum_units,eftsl,level,subject_code,subject_name,school,college,academic_career,convener_text,delivery_summary,introduction,description,workload_text,workload_hours,inherent_requirements,prescribed_texts,offering_status,source_updated_at";

export type PublishedCourseFilters = {
  query?: string;
  subject?: string;
  level?: string;
  session?: string;
};

export type PublishedCoursePage = {
  courses: CourseDetails[];
  page: number;
  pageSize: number;
  total: number;
};

export type AcademicYearOption = {
  hasPublishedCourses: boolean;
  year: number;
};

function sourceUrl(year: number, code: string) {
  return `${ANU_SOURCE_BASE_URL}/${year}/course/${code}`;
}

function isRecord(
  value: Json | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Json | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: Json | undefined) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: Json | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readNullableNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArray(value: Json | undefined) {
  return Array.isArray(value) ? value : [];
}

function snapshotUnits(row: {
  maximum_units: number | null;
  minimum_units: number | null;
  units: number | null;
}) {
  return row.units ?? row.minimum_units ?? row.maximum_units ?? 0;
}

function unitValueFromSnapshot(row: SnapshotListRow): CourseUnitValue {
  if (row.unit_value_kind === "fixed" && row.units !== null) {
    return { kind: "fixed", units: row.units };
  }
  if (
    row.unit_value_kind === "range" &&
    row.minimum_units !== null &&
    row.maximum_units !== null
  ) {
    return {
      kind: "range",
      minimumUnits: row.minimum_units,
      maximumUnits: row.maximum_units,
    };
  }
  return {
    kind: row.unit_value_kind === "variable" ? "variable" : "unknown",
    options: [],
  };
}

function readUnitValue(
  snapshot: { [key: string]: Json | undefined },
  root: { [key: string]: Json | undefined },
): CourseUnitValue {
  const kind = readString(snapshot.unitValueKind);
  if (kind === "fixed") {
    const units = readNullableNumber(snapshot.units);
    return units === null ? { kind: "unknown", options: [] } : { kind, units };
  }
  if (kind === "range") {
    const minimumUnits = readNullableNumber(snapshot.minimumUnits);
    const maximumUnits = readNullableNumber(snapshot.maximumUnits);
    return minimumUnits === null || maximumUnits === null
      ? { kind: "unknown", options: [] }
      : { kind, minimumUnits, maximumUnits };
  }
  if (kind === "variable") {
    const options = readArray(root.unitOptions)
      .flatMap((value) => {
        if (!isRecord(value)) return [];
        const units = readNullableNumber(value.units);
        if (units === null) return [];
        return [{ units, label: readNullableString(value.label) }];
      })
      .sort((left, right) => left.units - right.units);
    return { kind, options };
  }
  return { kind: "unknown", options: [] };
}

function displayUnits(value: CourseUnitValue) {
  if (value.kind === "fixed") return value.units;
  if (value.kind === "range") return value.minimumUnits;
  if (value.kind === "variable") return value.options[0]?.units ?? 0;
  return 0;
}

function readPrerequisiteEdges(value: Json | undefined) {
  return readArray(value).flatMap<CoursePrerequisiteEdge>((item) => {
    if (!isRecord(item)) return [];
    const from = readString(
      item.from,
      readString(item.from_code),
    ).toUpperCase();
    const to = readString(item.to, readString(item.to_code)).toUpperCase();
    if (!COURSE_CODE_PATTERN.test(from) || !COURSE_CODE_PATTERN.test(to)) {
      return [];
    }
    return [
      {
        from,
        to,
        fromIsAvailable:
          item.fromIsAvailable === true || item.from_is_available === true,
        toIsAvailable:
          item.toIsAvailable === true || item.to_is_available === true,
      },
    ];
  });
}

type ProjectionGroup = {
  key: string;
  minimumCount: number | null;
  operator: string;
  parentKey: string | null;
  position: number;
};
type ProjectionCondition = {
  confidence: number;
  courseCode: string | null;
  courseRequirementMode: string | null;
  courseSetCodes: string[];
  freeText: string | null;
  groupKey: string;
  minimumCount: number | null;
  optionCodes: string[];
  structureKind: string | null;
  tag: string | null;
  hardness: string;
  key: string;
  kind: string;
  level: number | null;
  maximumLevel: number | null;
  minimumGpa: number | null;
  minimumMark: number | null;
  minimumWam: number | null;
  minimumYear: number | null;
  position: number;
  programmeCode: string | null;
  reviewState: string;
  sourceText: string;
  subject: string | null;
  units: number | null;
};

export function readProjectionPrerequisiteRule(root: {
  [key: string]: Json | undefined;
}) {
  const rule = readArray(root.rules).find(
    (value) => isRecord(value) && readString(value.ruleKind) === "prerequisite",
  );
  if (!isRecord(rule)) return null;
  const sourceText = readString(rule.sourceText);
  if (!sourceText) return null;

  const groups = readArray(root.ruleGroups).flatMap<ProjectionGroup>(
    (value) => {
      if (!isRecord(value) || readString(value.ruleKey) !== "prerequisite") {
        return [];
      }
      const key = readString(value.key);
      const operator = readString(value.operator);
      const position = readNumber(value.position, Number.NaN);
      if (!key || !Number.isInteger(position)) return [];
      return [
        {
          key,
          minimumCount: readNullableNumber(value.minimumCount),
          operator,
          parentKey: readNullableString(value.parentGroupKey),
          position,
        },
      ];
    },
  );
  const courseSetCodesByCondition = new Map<string, string[]>();
  const optionCodesByCondition = new Map<string, string[]>();
  for (const value of readArray(root.ruleConditionCourses)) {
    if (!isRecord(value)) continue;
    const conditionKey = readString(value.conditionKey);
    const code = readString(value.sourceCourseCode).toUpperCase();
    if (!conditionKey || !code) continue;
    const options = optionCodesByCondition.get(conditionKey) ?? [];
    if (!options.includes(code)) options.push(code);
    optionCodesByCondition.set(conditionKey, options);
    if (!COURSE_CODE_PATTERN.test(code)) continue;
    const codes = courseSetCodesByCondition.get(conditionKey) ?? [];
    if (!codes.includes(code)) codes.push(code);
    courseSetCodesByCondition.set(conditionKey, codes);
  }
  const conditions = readArray(
    root.ruleConditions,
  ).flatMap<ProjectionCondition>((value) => {
    if (!isRecord(value) || readString(value.ruleKey) !== "prerequisite") {
      return [];
    }
    const groupKey = readString(value.groupKey);
    const key = readString(value.key);
    const kind = readString(value.conditionKind);
    const position = readNumber(value.position, Number.NaN);
    if (!groupKey || !key || !kind || !Number.isInteger(position)) return [];
    return [
      {
        confidence: readNumber(value.confidence),
        courseCode:
          readNullableString(value.requiredCourseCode)?.toUpperCase() ?? null,
        courseRequirementMode: readNullableString(value.courseRequirementMode),
        courseSetCodes: courseSetCodesByCondition.get(key) ?? [],
        freeText: readNullableString(value.freeText),
        groupKey,
        hardness: readString(value.hardness),
        key,
        kind,
        level: readNullableNumber(value.minimumCourseLevel),
        maximumLevel: readNullableNumber(value.maximumCourseLevel),
        minimumCount: readNullableNumber(value.minimumCount),
        minimumGpa: readNullableNumber(value.minimumGpa),
        minimumMark: readNullableNumber(value.minimumMark),
        minimumWam: readNullableNumber(value.minimumWam),
        minimumYear: readNullableNumber(value.minimumYear),
        optionCodes: optionCodesByCondition.get(key) ?? [],
        position,
        programmeCode: readNullableString(value.requiredStructureCode),
        reviewState: readString(value.reviewState),
        sourceText: readString(value.sourceText),
        structureKind: readNullableString(value.structureKind),
        subject: readNullableString(value.subjectCode)?.toUpperCase() ?? null,
        tag: readNullableString(value.tag),
        units: readNullableNumber(value.minimumUnits),
      },
    ];
  });
  const roots = groups.filter((group) => group.parentKey === null);

  function conditionBase(condition: ProjectionCondition) {
    return {
      confidence: condition.confidence,
      hardness:
        condition.hardness === "advisory"
          ? ("advisory" as const)
          : ("hard" as const),
      reviewState:
        condition.reviewState === "verified"
          ? ("verified" as const)
          : condition.reviewState === "automatic"
            ? ("automatic" as const)
            : ("review" as const),
      sourceText: condition.sourceText,
    };
  }

  function relationalCondition(
    condition: ProjectionCondition,
  ): CourseRuleExpression {
    const base = conditionBase(condition);
    if (
      condition.kind === "course" &&
      condition.courseCode &&
      COURSE_CODE_PATTERN.test(condition.courseCode) &&
      (condition.courseRequirementMode === "completed" ||
        condition.courseRequirementMode === "completed_or_concurrent")
    ) {
      return {
        ...base,
        kind: "course",
        code: condition.courseCode,
        minimumMark: condition.minimumMark,
        requirementMode: condition.courseRequirementMode,
      };
    }
    if (
      condition.kind === "incompatible" &&
      condition.courseCode &&
      COURSE_CODE_PATTERN.test(condition.courseCode)
    ) {
      return { ...base, kind: "incompatible", code: condition.courseCode };
    }
    if (condition.kind === "units_total" && condition.units !== null) {
      return {
        ...base,
        kind: "units_total",
        subject: null,
        units: condition.units,
      };
    }
    if (
      condition.kind === "subject_units" &&
      condition.subject &&
      condition.units !== null
    ) {
      return {
        ...base,
        kind: "subject_units",
        subject: condition.subject,
        units: condition.units,
      };
    }
    if (
      condition.kind === "level_units" &&
      condition.level !== null &&
      condition.units !== null
    ) {
      return {
        ...base,
        kind: "level_units",
        maximumLevel: condition.maximumLevel,
        minimumLevel: condition.level,
        subject: condition.subject,
        units: condition.units,
      };
    }
    if (
      condition.kind === "course_set_units" &&
      condition.units !== null &&
      condition.courseSetCodes.length > 0
    ) {
      return {
        ...base,
        kind: "course_set_units",
        courseCodes: condition.courseSetCodes,
        units: condition.units,
      };
    }
    if (condition.kind === "year_standing" && condition.minimumYear !== null) {
      return {
        ...base,
        kind: "year_standing",
        minimumYear: condition.minimumYear,
      };
    }
    if (condition.kind === "structure") {
      return {
        ...base,
        kind: "structure",
        structureCode: condition.programmeCode,
        text: condition.freeText,
      };
    }
    if (condition.kind === "structure_set") {
      return {
        ...base,
        kind: "structure_set",
        minimumCount: condition.minimumCount,
        structureCodes: condition.optionCodes,
        structureKind: condition.structureKind,
      };
    }
    if (
      condition.kind === "tagged_units" &&
      condition.tag &&
      condition.units !== null
    ) {
      return {
        ...base,
        kind: "tagged_units",
        tag: condition.tag,
        units: condition.units,
      };
    }
    if (condition.kind === "elective_units" && condition.units !== null) {
      return { ...base, kind: "elective_units", units: condition.units };
    }
    if (condition.kind === "gpa" && condition.minimumGpa !== null) {
      return { ...base, kind: "gpa", minimumGpa: condition.minimumGpa };
    }
    if (condition.kind === "wam" && condition.minimumWam !== null) {
      return { ...base, kind: "wam", minimumWam: condition.minimumWam };
    }
    if (condition.kind === "permission") {
      return {
        ...base,
        kind: "permission",
        text: condition.freeText ?? condition.sourceText,
      };
    }
    return {
      ...base,
      kind: "other",
      text: condition.freeText ?? condition.sourceText,
    };
  }

  function relationalExpressionForGroup(
    key: string,
    ancestors = new Set<string>(),
  ): CourseRuleExpression | null {
    if (ancestors.has(key)) return null;
    const group = groups.find((candidate) => candidate.key === key);
    if (!group || !["all_of", "any_of", "at_least"].includes(group.operator)) {
      return null;
    }
    const children = [
      ...groups
        .filter((candidate) => candidate.parentKey === key)
        .map((value) => ({
          type: "group" as const,
          position: value.position,
          value,
        })),
      ...conditions
        .filter((candidate) => candidate.groupKey === key)
        .map((value) => ({
          type: "condition" as const,
          position: value.position,
          value,
        })),
    ].sort((left, right) => left.position - right.position);
    if (children.length === 0) return null;
    const nextAncestors = new Set(ancestors).add(key);
    const expressions: CourseRuleExpression[] = [];
    for (const child of children) {
      if (child.type === "condition") {
        expressions.push(relationalCondition(child.value));
        continue;
      }
      const nested = relationalExpressionForGroup(
        child.value.key,
        nextAncestors,
      );
      if (!nested) return null;
      expressions.push(nested);
    }
    return {
      kind: "group",
      operator: group.operator as "all_of" | "any_of" | "at_least",
      minimumCount: group.operator === "at_least" ? group.minimumCount : null,
      conditions: expressions,
    };
  }

  function expressionForGroup(
    key: string,
    ancestors = new Set<string>(),
  ): RequisiteExpression | null {
    if (ancestors.has(key)) return null;
    const group = groups.find((candidate) => candidate.key === key);
    if (!group || !["all_of", "any_of"].includes(group.operator)) return null;
    const children = [
      ...groups
        .filter((candidate) => candidate.parentKey === key)
        .map((value) => ({
          type: "group" as const,
          position: value.position,
          value,
        })),
      ...conditions
        .filter((candidate) => candidate.groupKey === key)
        .map((value) => ({
          type: "condition" as const,
          position: value.position,
          value,
        })),
    ].sort((left, right) => left.position - right.position);
    if (children.length === 0) return null;

    const nextAncestors = new Set(ancestors).add(key);
    const expressions: RequisiteExpression[] = [];
    for (const child of children) {
      if (child.type === "group") {
        const expression = expressionForGroup(child.value.key, nextAncestors);
        if (!expression) return null;
        expressions.push(expression);
        continue;
      }
      const condition = child.value;
      if (
        condition.kind === "course" &&
        condition.courseCode &&
        COURSE_CODE_PATTERN.test(condition.courseCode) &&
        condition.minimumMark === null
      ) {
        expressions.push({ kind: "course", code: condition.courseCode });
      } else if (
        condition.kind === "subject_units" &&
        condition.subject &&
        condition.units
      ) {
        expressions.push({
          kind: "subject_units",
          subject: condition.subject,
          units: condition.units,
        });
      } else if (
        condition.kind === "level_units" &&
        condition.level !== null &&
        condition.units
      ) {
        expressions.push({
          kind: "level_units",
          level: condition.level,
          units: condition.units,
          ...(condition.subject ? { subject: condition.subject } : {}),
        });
      } else if (condition.kind === "units_total" && condition.units) {
        expressions.push({ kind: "units_total", units: condition.units });
      } else if (condition.kind === "structure" && condition.programmeCode) {
        expressions.push({
          kind: "programme_enrolment",
          code: condition.programmeCode,
          name: condition.freeText ?? condition.programmeCode,
        });
      } else {
        return null;
      }
    }
    return {
      kind: "group",
      operator: group.operator as "all_of" | "any_of",
      conditions: expressions,
    };
  }

  const expression =
    roots.length === 1 ? expressionForGroup(roots[0].key) : null;
  const relationalExpression =
    roots.length === 1 ? relationalExpressionForGroup(roots[0].key) : null;
  return {
    confidence: readNumber(rule.confidence),
    expression,
    hardness: readString(rule.hardness) === "advisory" ? "advisory" : "hard",
    relationalExpression,
    reviewState:
      readString(rule.reviewState) === "verified"
        ? "verified"
        : readString(rule.reviewState) === "automatic"
          ? "automatic"
          : "review",
    sourceText,
  } satisfies CourseRequisiteRule;
}

function ruleText(
  root: { [key: string]: Json | undefined },
  kind: string,
  fallback = "",
) {
  const texts = readArray(root.rules).flatMap((value) =>
    isRecord(value) && readString(value.ruleKind) === kind
      ? [readString(value.sourceText)].filter(Boolean)
      : [],
  );
  return texts.length ? texts.join("\n\n") : fallback;
}

function readFees(value: Json | undefined) {
  return readArray(value).flatMap<CourseFee>((item) => {
    if (!isRecord(item)) return [];
    return [
      {
        amount: readNullableNumber(item.amount),
        audience: readString(item.audience, "other"),
        basis: readString(item.basis, "unknown"),
        currency: readNullableString(item.currency),
        feeType: readString(item.feeType, "other"),
        feeYear: readNullableNumber(item.feeYear),
        sourceLabel: readNullableString(item.sourceLabel),
        sourceText: readNullableString(item.sourceText),
        studentContributionBand: readNullableNumber(
          item.studentContributionBand,
        ),
      },
    ];
  });
}

function readOfferings(value: Json | undefined, academicYear: number) {
  return readArray(value).flatMap<CourseOffering>((item) => {
    if (!isRecord(item)) return [];
    const periodName = readString(item.academicPeriodName);
    const periodCode = readString(item.academicPeriodCode);
    if (!periodName && !periodCode) return [];
    return [
      {
        calendarYear: readNumber(item.calendarYear, academicYear),
        censusOn: readNullableString(item.censusOn),
        classNumber: readNullableString(item.classNumber),
        classSummaryUrl: readNullableString(item.classSummaryUrl),
        deliveryMode: readNullableString(item.deliveryMode),
        endsOn: readNullableString(item.endsOn),
        enrolClosesOn: readNullableString(item.enrolClosesOn),
        location: readNullableString(item.location),
        periodCode,
        periodName: periodName || periodCode,
        startsOn: readNullableString(item.startsOn),
      },
    ];
  });
}

function readAssessments(root: { [key: string]: Json | undefined }) {
  const links = readArray(root.assessmentOutcomes).flatMap((item) => {
    if (!isRecord(item)) return [];
    const assessmentPosition = readNullableNumber(item.assessmentPosition);
    const learningOutcomePosition = readNullableNumber(
      item.learningOutcomePosition,
    );
    return assessmentPosition === null || learningOutcomePosition === null
      ? []
      : [{ assessmentPosition, learningOutcomePosition }];
  });
  return readArray(root.assessmentItems).flatMap<CourseAssessment>((item) => {
    if (!isRecord(item)) return [];
    const position = readNullableNumber(item.position);
    const title = readString(item.title);
    if (position === null || !title) return [];
    return [
      {
        dueText: readNullableString(item.dueText),
        hurdle:
          item.hurdle === null
            ? null
            : typeof item.hurdle === "boolean"
              ? item.hurdle
              : null,
        learningOutcomePositions: links
          .filter((link) => link.assessmentPosition === position)
          .map((link) => link.learningOutcomePosition),
        position,
        title,
        weight: readNullableNumber(item.weight),
      },
    ];
  });
}

function detailAsCourseDetails(value: Json): CourseDetails | null {
  if (!isRecord(value) || !isRecord(value.snapshot)) return null;
  const code = readString(
    value.code,
    readString(value.courseCode),
  ).toUpperCase();
  const academicYear = readNumber(value.academicYear);
  if (!COURSE_CODE_PATTERN.test(code) || !Number.isInteger(academicYear)) {
    return null;
  }
  const snapshot = value.snapshot;
  const unitValue = readUnitValue(snapshot, value);
  const offerings = readOfferings(value.offeringSessions, academicYear);
  const prerequisiteEdges = readPrerequisiteEdges(value.prerequisiteEdges);
  const prerequisiteCodes = [
    ...new Set(
      [
        ...readArray(value.prerequisiteCodes).map((item) =>
          readString(item).toUpperCase(),
        ),
        ...prerequisiteEdges.map((edge) => edge.from),
      ].filter((item) => item !== code && COURSE_CODE_PATTERN.test(item)),
    ),
  ].sort();
  const availableCourseCodes = new Set<string>([code]);
  for (const edge of prerequisiteEdges) {
    if (edge.fromIsAvailable) availableCourseCodes.add(edge.from);
    if (edge.toIsAvailable) availableCourseCodes.add(edge.to);
  }

  const areasOfInterest = readArray(value.areasOfInterest).flatMap((item) =>
    isRecord(item) && readString(item.name) ? [readString(item.name)] : [],
  );
  const tags = readArray(value.tags).flatMap((item) =>
    isRecord(item) && readString(item.name) ? [readString(item.name)] : [],
  );
  const attributes = readArray(value.attributes).flatMap<CourseAttribute>(
    (item) =>
      isRecord(item) && readString(item.value)
        ? [
            {
              kind: readString(item.attributeKind, "other"),
              value: readString(item.value),
            },
          ]
        : [],
  );
  const relatedCourses = readArray(
    value.relatedCourses,
  ).flatMap<CourseRelatedCourse>((item) => {
    if (!isRecord(item)) return [];
    const relatedCode = readString(item.sourceCourseCode).toUpperCase();
    if (!COURSE_CODE_PATTERN.test(relatedCode)) return [];
    return [
      {
        code: relatedCode,
        kind: readString(item.relationKind, "other"),
        sourceText: readNullableString(item.sourceText),
        title: readNullableString(item.sourceCourseTitle),
      },
    ];
  });
  const learningOutcomes = readArray(value.learningOutcomes).flatMap((item) => {
    if (!isRecord(item)) return [];
    const body = readString(item.body);
    const position = readNullableNumber(item.position);
    return body && position !== null ? [{ body, position }] : [];
  });
  const courseOffering = isRecord(value.courseOffering)
    ? value.courseOffering
    : null;
  const delivery =
    offerings.find((offering) => offering.deliveryMode)?.deliveryMode ??
    (courseOffering ? readNullableString(courseOffering.deliveryMode) : null) ??
    readNullableString(snapshot.deliverySummary) ??
    "Not listed";
  const sessions = [
    ...new Set(offerings.map((offering) => offering.periodName)),
  ].sort();
  const prerequisiteText = ruleText(
    value,
    "prerequisite",
    "No prerequisites listed.",
  );

  return {
    academicCareer: readNullableString(snapshot.academicCareer),
    accent: accentFor(code),
    areasOfInterest,
    tags,
    assessments: readAssessments(value),
    assumedKnowledgeText: ruleText(value, "assumed_knowledge"),
    attributes,
    availableCourseCodes: [...availableCourseCodes].sort(),
    code,
    snapshotId: readNullableNumber(value.snapshotId) ?? undefined,
    college: readNullableString(snapshot.college),
    convener: readString(snapshot.convenerText, "Not listed"),
    corequisiteText: ruleText(value, "corequisite"),
    delivery,
    description: readString(snapshot.description, "No description is listed."),
    eftsl: readNullableNumber(snapshot.eftsl),
    fees: readFees(value.fees),
    incompatibilityText: ruleText(value, "incompatibility"),
    inherentRequirements: readNullableString(snapshot.inherentRequirements),
    introduction: readNullableString(snapshot.introduction),
    learningOutcomes,
    level: readNumber(snapshot.level),
    name: readString(snapshot.title, code),
    offeringStatus: readString(
      snapshot.offeringStatus,
      "unknown",
    ) as CourseDetails["offeringStatus"],
    offerings,
    permissionText: ruleText(value, "permission"),
    prescribedTexts: readNullableString(snapshot.prescribedTexts),
    prerequisiteCodes,
    prerequisiteEdges,
    prerequisiteRule: readProjectionPrerequisiteRule(value),
    prerequisiteText,
    publicationStatus: "published",
    relatedCourses,
    reviewState: "verified",
    school: readString(snapshot.school, "Not listed"),
    sessions,
    sourceUpdatedAt: readNullableString(snapshot.sourceUpdatedAt),
    sourceUrl: sourceUrl(academicYear, code),
    // The published detail always carries a graph array, even when empty. A
    // draft projection has no key at all, so the reverse lookup never ran.
    unlocksAreKnown: Array.isArray(value.prerequisiteEdges),
    subject: readString(snapshot.subjectCode, code.slice(0, 4)),
    subjectName: readNullableString(snapshot.subjectName),
    unitValue,
    units: displayUnits(unitValue),
    workloadHours: readNullableNumber(snapshot.workloadHours),
    workloadText: readNullableString(snapshot.workloadText),
    year: academicYear,
  };
}

/**
 * The reader's view of course content with no version behind it, such as a
 * mutable draft. Identical to a published read apart from saying so, which is
 * what lets one preview component answer "what will students see".
 */
export function courseFromDraftProjection(
  projection: Json,
): CourseDetails | null {
  const details = detailAsCourseDetails(projection);
  return details === null
    ? null
    : { ...details, publicationStatus: "draft" as const };
}

export function courseFromSnapshotProjection(
  projection: Json,
  snapshotId: number,
): CourseDetails | null {
  if (!isRecord(projection) || !Number.isSafeInteger(snapshotId)) return null;
  return detailAsCourseDetails({ ...projection, snapshotId });
}

async function academicYearRecord(
  supabase: SupabaseClient<Database>,
  requestedYear: number,
): Promise<AcademicYearRow | null> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id,year")
    .eq("year", requestedYear)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadAcademicYearOptionsUncached(): Promise<
  AcademicYearOption[]
> {
  const supabase = createPublicClient();
  const { data: years, error } = await supabase
    .from("academic_years")
    .select("id,year")
    .gte("year", 2020)
    .lte("year", 2030)
    .order("year", { ascending: false });
  if (error) throw error;
  return Promise.all(
    ((years ?? []) as AcademicYearRow[]).map(async (year) => {
      const { count, error: countError } = await supabase
        .from("catalogue_records")
        .select("id", { count: "exact", head: true })
        .eq("academic_year_id", year.id)
        .eq("kind", "course")
        .is("archived_at", null)
        .not("published_version_id", "is", null);
      if (countError) throw countError;
      return { year: year.year, hasPublishedCourses: (count ?? 0) > 0 };
    }),
  );
}

export async function loadAcademicYearOptions(): Promise<AcademicYearOption[]> {
  return unstable_cache(
    loadAcademicYearOptionsUncached,
    ["published-academic-year-options"],
    {
      revalidate: 300,
      tags: [PUBLISHED_COURSE_YEARS_TAG],
    },
  )();
}

function firstFilterValue(value?: string) {
  return value?.trim().slice(0, 120) ?? "";
}

function searchPattern(value: string) {
  return value
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function snapshotIdsForSession(
  supabase: SupabaseClient<Database>,
  yearId: number,
  session: string,
) {
  const { data, error } = await supabase
    .from("offering_sessions")
    .select("version_id")
    .eq("academic_year_id", yearId)
    .eq("academic_period_name", session);
  if (error) throw error;
  return [
    ...new Set(
      (data ?? []).flatMap((row) =>
        row.version_id === null ? [] : [row.version_id],
      ),
    ),
  ];
}

async function loadListRelationships(
  supabase: SupabaseClient<Database>,
  snapshots: SnapshotListRow[],
  year: AcademicYearRow,
) {
  const snapshotIds = snapshots.map((snapshot) => snapshot.version_id);
  if (snapshotIds.length === 0) return [];
  const [offeringsResult, rulesResult] = await Promise.all([
    supabase
      .from("course_offerings")
      .select("id,version_id,delivery_mode,location")
      .in("version_id", snapshotIds),
    supabase
      .from("requirement_rules")
      .select("id,version_id,rule_kind,source_text,confidence,review_state")
      .in("version_id", snapshotIds)
      .in("rule_kind", ["prerequisite", "incompatibility"]),
  ]);
  if (offeringsResult.error) throw offeringsResult.error;
  if (rulesResult.error) throw rulesResult.error;
  const offerings = (offeringsResult.data ?? []) as OfferingRow[];
  const rules = (rulesResult.data ?? []) as RuleRow[];
  const offeringIds = offerings.map((offering) => offering.id);
  const ruleIds = rules.map((rule) => rule.id);
  const [sessionsResult, referencesResult, conditionsResult] =
    await Promise.all([
      offeringIds.length
        ? supabase
            .from("offering_sessions")
            .select(
              "course_offering_id,version_id,position,academic_period_code,academic_period_name,class_number,starts_on,enrol_closes_on,census_on,ends_on,delivery_mode,location,class_summary_url",
            )
            .in("course_offering_id", offeringIds)
        : Promise.resolve({ data: [], error: null }),
      ruleIds.length
        ? supabase
            .from("requirement_item_references")
            .select("rule_id,code_id")
            .in("rule_id", ruleIds)
        : Promise.resolve({ data: [], error: null }),
      ruleIds.length
        ? supabase
            .from("requirement_conditions")
            .select("rule_id,code_id")
            .in("rule_id", ruleIds)
            .eq("condition_kind", "course")
            .not("code_id", "is", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (referencesResult.error) throw referencesResult.error;
  if (conditionsResult.error) throw conditionsResult.error;
  const references = (referencesResult.data ?? []) as RuleReferenceRow[];
  const conditions = (conditionsResult.data ?? []) as RuleConditionRow[];
  const referencedIds = [
    ...new Set([
      ...references.map((reference) => reference.code_id),
      ...conditions.flatMap((condition) =>
        condition.code_id === null ? [] : [condition.code_id],
      ),
    ]),
  ];
  const [referencedResult, publishedReferencesResult] = await Promise.all([
    referencedIds.length
      ? supabase
          .from("catalogue_codes")
          .select("id,code")
          .in("id", referencedIds)
      : Promise.resolve({ data: [], error: null }),
    referencedIds.length
      ? supabase
          .from("catalogue_records")
          .select("code_id")
          .eq("academic_year_id", year.id)
          .eq("kind", "course")
          .is("archived_at", null)
          .in("code_id", referencedIds)
          .not("published_version_id", "is", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (referencedResult.error) throw referencedResult.error;
  if (publishedReferencesResult.error) throw publishedReferencesResult.error;

  const codeById = new Map(
    ((referencedResult.data ?? []) as CourseIdentityRow[]).map((row) => [
      row.id,
      row.code,
    ]),
  );
  const publishedReferenceIds = new Set(
    (publishedReferencesResult.data ?? []).map((row) => row.code_id),
  );
  const offeringBySnapshot = new Map(
    offerings.map((offering) => [offering.version_id, offering]),
  );
  const sessions = (sessionsResult.data ?? []) as OfferingSessionRow[];
  const sessionsBySnapshot = new Map<number, OfferingSessionRow[]>();
  for (const session of sessions) {
    if (session.version_id === null) continue;
    const existing = sessionsBySnapshot.get(session.version_id) ?? [];
    existing.push(session);
    sessionsBySnapshot.set(session.version_id, existing);
  }
  const rulesBySnapshot = new Map<number, RuleRow[]>();
  for (const rule of rules) {
    if (rule.version_id === null) continue;
    const existing = rulesBySnapshot.get(rule.version_id) ?? [];
    existing.push(rule);
    rulesBySnapshot.set(rule.version_id, existing);
  }
  const referencedIdsByRule = new Map<number, Set<number>>();
  for (const reference of references) {
    const existing =
      referencedIdsByRule.get(reference.rule_id) ?? new Set<number>();
    existing.add(reference.code_id);
    referencedIdsByRule.set(reference.rule_id, existing);
  }
  for (const condition of conditions) {
    if (condition.code_id === null) continue;
    const existing =
      referencedIdsByRule.get(condition.rule_id) ?? new Set<number>();
    existing.add(condition.code_id);
    referencedIdsByRule.set(condition.rule_id, existing);
  }

  return snapshots.flatMap((snapshot) => {
    const code = snapshot.code;
    const snapshotSessions = sessionsBySnapshot.get(snapshot.version_id) ?? [];
    const offering = offeringBySnapshot.get(snapshot.version_id);
    const snapshotRules = rulesBySnapshot.get(snapshot.version_id) ?? [];
    const prerequisiteRules = snapshotRules.filter(
      (rule) => rule.rule_kind === "prerequisite",
    );
    const prerequisiteIds = new Set(
      prerequisiteRules.flatMap((rule) => [
        ...(referencedIdsByRule.get(rule.id) ?? []),
      ]),
    );
    const prerequisiteCodes = [...prerequisiteIds]
      .flatMap((id) => (codeById.get(id) ? [codeById.get(id)!] : []))
      .sort();
    const prerequisiteEdges = [
      ...prerequisiteIds,
    ].flatMap<CoursePrerequisiteEdge>((id) => {
      const prerequisiteCode = codeById.get(id);
      return prerequisiteCode
        ? [
            {
              from: prerequisiteCode,
              to: code,
              fromIsAvailable: publishedReferenceIds.has(id),
              toIsAvailable: true,
            },
          ]
        : [];
    });
    const sessionNames = [
      ...new Set(
        snapshotSessions.flatMap((session) =>
          session.academic_period_name ? [session.academic_period_name] : [],
        ),
      ),
    ].sort();
    const unitValue = unitValueFromSnapshot(snapshot);
    const availableCodes = [
      code,
      ...[...prerequisiteIds].flatMap((id) =>
        publishedReferenceIds.has(id) && codeById.get(id)
          ? [codeById.get(id)!]
          : [],
      ),
    ];
    return [
      {
        academicCareer: snapshot.academic_career,
        accent: accentFor(code),
        areasOfInterest: [],
        tags: [],
        assessments: [],
        assumedKnowledgeText: "",
        attributes: [],
        availableCourseCodes: availableCodes,
        code,
        snapshotId: snapshot.version_id,
        college: snapshot.college,
        convener: snapshot.convener_text ?? "Not listed",
        corequisiteText: "",
        delivery:
          snapshotSessions.find((session) => session.delivery_mode)
            ?.delivery_mode ??
          offering?.delivery_mode ??
          snapshot.delivery_summary ??
          "Not listed",
        description: snapshot.description ?? "No description is listed.",
        eftsl: snapshot.eftsl,
        fees: [],
        incompatibilityText: snapshotRules
          .filter((rule) => rule.rule_kind === "incompatibility")
          .map((rule) => rule.source_text)
          .join("\n\n"),
        inherentRequirements: snapshot.inherent_requirements,
        introduction: snapshot.introduction,
        learningOutcomes: [],
        level: snapshot.level ?? 0,
        name: snapshot.title,
        offeringStatus:
          snapshot.offering_status as CourseDetails["offeringStatus"],
        offerings: snapshotSessions.flatMap((session) => {
          const periodName =
            session.academic_period_name ?? session.academic_period_code;
          if (!periodName) return [];
          return [
            {
              calendarYear: year.year,
              censusOn: session.census_on,
              classNumber: session.class_number,
              classSummaryUrl: session.class_summary_url,
              deliveryMode: session.delivery_mode,
              endsOn: session.ends_on,
              enrolClosesOn: session.enrol_closes_on,
              location: session.location,
              periodCode: session.academic_period_code ?? "",
              periodName,
              startsOn: session.starts_on,
            },
          ];
        }),
        permissionText: "",
        prescribedTexts: snapshot.prescribed_texts,
        prerequisiteCodes,
        prerequisiteEdges,
        prerequisiteRule: null,
        prerequisiteText:
          prerequisiteRules.map((rule) => rule.source_text).join("\n\n") ||
          "No prerequisites listed.",
        publicationStatus: "published",
        relatedCourses: [],
        reviewState: "verified",
        school: snapshot.school ?? "Not listed",
        sessions: sessionNames,
        sourceUpdatedAt: snapshot.source_updated_at,
        sourceUrl: sourceUrl(year.year, code),
        // The list query reads prerequisite references only, never the reverse.
        unlocksAreKnown: false,
        subject: snapshot.subject_code ?? code.slice(0, 4),
        subjectName: snapshot.subject_name,
        unitValue,
        units: snapshotUnits(snapshot),
        workloadHours: snapshot.workload_hours,
        workloadText: snapshot.workload_text,
        year: year.year,
      } satisfies CourseDetails,
    ];
  });
}

async function loadPublishedCoursePageUncached({
  academicYear,
  filters = {},
  page = 1,
  pageSize = 24,
}: {
  academicYear: number;
  filters?: PublishedCourseFilters;
  page?: number;
  pageSize?: number;
}): Promise<PublishedCoursePage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const query = firstFilterValue(filters.query);
  const subject = firstFilterValue(filters.subject).toUpperCase();
  const level = Number(firstFilterValue(filters.level));
  const session = firstFilterValue(filters.session);

  const supabase = createPublicClient();
  const year = await academicYearRecord(supabase, academicYear);
  if (!year) {
    return { courses: [], page: safePage, pageSize: safePageSize, total: 0 };
  }
  const cleanedQuery = searchPattern(query);
  const sessionSnapshotIds = session
    ? await snapshotIdsForSession(supabase, year.id, session)
    : null;
  if (sessionSnapshotIds?.length === 0) {
    return { courses: [], page: safePage, pageSize: safePageSize, total: 0 };
  }

  let snapshotsQuery = supabase
    .from("published_course_summaries")
    .select(SNAPSHOT_LIST_SELECT, { count: "exact" })
    .eq("academic_year_id", year.id);
  if (subject) snapshotsQuery = snapshotsQuery.eq("subject_code", subject);
  if (Number.isInteger(level) && level > 0) {
    snapshotsQuery = snapshotsQuery.eq("level", level * 1000);
  }
  if (sessionSnapshotIds) {
    snapshotsQuery = snapshotsQuery.in("version_id", sessionSnapshotIds);
  }
  if (cleanedQuery) {
    const pattern = `*${cleanedQuery}*`;
    snapshotsQuery = snapshotsQuery.or(
      `code.ilike.${pattern},title.ilike.${pattern},subject_code.ilike.${pattern},school.ilike.${pattern},convener_text.ilike.${pattern}`,
    );
  }
  const start = (safePage - 1) * safePageSize;
  const { data, count, error } = await snapshotsQuery
    .order("subject_code")
    .order("title")
    .range(start, start + safePageSize - 1);
  if (error) throw error;
  const courses = await loadListRelationships(
    supabase,
    (data ?? []) as SnapshotListRow[],
    year,
  );
  return { courses, page: safePage, pageSize: safePageSize, total: count ?? 0 };
}

export async function loadPublishedCoursePage(args: {
  academicYear: number;
  filters?: PublishedCourseFilters;
  page?: number;
  pageSize?: number;
}): Promise<PublishedCoursePage> {
  const safePage = Math.max(1, Math.floor(args.page ?? 1));
  const safePageSize = Math.min(
    100,
    Math.max(1, Math.floor(args.pageSize ?? 24)),
  );
  const query = firstFilterValue(args.filters?.query);
  const subject = firstFilterValue(args.filters?.subject).toUpperCase();
  const level = Number(firstFilterValue(args.filters?.level));
  const session = firstFilterValue(args.filters?.session);

  return unstable_cache(
    () =>
      loadPublishedCoursePageUncached({
        academicYear: args.academicYear,
        filters: { query, subject, level: String(level), session },
        page: safePage,
        pageSize: safePageSize,
      }),
    [
      "published-course-page",
      String(args.academicYear),
      String(safePage),
      String(safePageSize),
      query,
      subject,
      String(level),
      session,
    ],
    {
      revalidate: 300,
      tags: [
        PUBLISHED_COURSE_PAGE_TAG,
        publishedCourseYearTag(args.academicYear),
      ],
    },
  )();
}

export async function loadPublishedCoursesByCodes(
  codes: readonly string[],
  academicYear: number,
) {
  const normalisedCodes = [
    ...new Set(
      codes
        .map((code) => code.trim().toUpperCase())
        .filter((code) => COURSE_CODE_PATTERN.test(code)),
    ),
  ];
  if (normalisedCodes.length === 0) return [];

  const courses = await Promise.all(
    normalisedCodes.map((code) => loadPublishedCourse(code, academicYear)),
  );
  return courses.filter((course): course is CourseDetails => course !== null);
}

export async function loadPublishedCoursesBySelections(
  selections: readonly { code: string; year: number }[],
) {
  const unique = [
    ...new Map(
      selections.map((selection) => [
        `${selection.year}:${selection.code.trim().toUpperCase()}`,
        { code: selection.code.trim().toUpperCase(), year: selection.year },
      ]),
    ).values(),
  ].filter(
    (selection) =>
      Number.isInteger(selection.year) &&
      COURSE_CODE_PATTERN.test(selection.code),
  );
  const courses = await Promise.all(
    unique.map((selection) =>
      loadPublishedCourse(selection.code, selection.year),
    ),
  );
  return courses.filter((course): course is CourseDetails => course !== null);
}

export async function loadPublishedCourseFilterOptions(academicYear: number) {
  const supabase = createPublicClient();
  const year = await academicYearRecord(supabase, academicYear);
  if (!year) return { subjects: [], levels: [], sessions: [] };
  const [snapshotsResult, sessionsResult] = await Promise.all([
    supabase
      .from("published_course_summaries")
      .select("subject_code,level")
      .eq("academic_year_id", year.id),
    supabase
      .from("offering_sessions")
      .select("academic_period_name")
      .eq("academic_year_id", year.id),
  ]);
  if (snapshotsResult.error) throw snapshotsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  return {
    subjects: [
      ...new Set(
        (snapshotsResult.data ?? []).flatMap((item) =>
          item.subject_code ? [item.subject_code] : [],
        ),
      ),
    ].sort(),
    levels: [
      ...new Set(
        (snapshotsResult.data ?? []).flatMap((item) =>
          item.level === null ? [] : [item.level / 1000],
        ),
      ),
    ].sort(),
    sessions: [
      ...new Set(
        (sessionsResult.data ?? []).flatMap((item) =>
          item.academic_period_name ? [item.academic_period_name] : [],
        ),
      ),
    ].sort(),
  };
}

export async function loadPublishedCourses(academicYear: number) {
  return (await loadPublishedCoursePage({ academicYear, pageSize: 100 }))
    .courses;
}

type LooseRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};

export async function loadPublishedCourse(
  code: string,
  academicYear: number,
): Promise<CourseDetails | null> {
  const normalisedCode = code.trim().toUpperCase();
  if (
    !COURSE_CODE_PATTERN.test(normalisedCode) ||
    !Number.isInteger(academicYear)
  ) {
    return null;
  }

  return unstable_cache(
    async () => {
      const client = createPublicClient() as unknown as LooseRpcClient;
      const { data, error } = await client.rpc("published_course_detail", {
        p_academic_year: academicYear,
        p_course_code: normalisedCode,
      });
      if (error) throw new Error(error.message);
      if (!data) return null;
      return detailAsCourseDetails(data);
    },
    ["published-course-detail", String(academicYear), normalisedCode],
    {
      revalidate: 300,
      tags: [
        PUBLISHED_COURSE_DETAIL_TAG,
        publishedCourseTag(academicYear, normalisedCode),
        publishedCourseYearTag(academicYear),
      ],
    },
  )();
}
