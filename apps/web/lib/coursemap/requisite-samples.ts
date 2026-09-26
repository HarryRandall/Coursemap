import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";

export type SampleStudent = "new" | "partway" | "complete";

type Draft = {
  completed: Map<string, { units: number; mark: number | null }>;
  programmeCodes: Set<string>;
  wam: number | null;
  gpa: number | null;
  studyYear: number;
};

const COURSE_UNITS = 6;

/**
 * Invented course codes that count towards a unit rule. They use the top of
 * each level's number range and skip any code the sample already holds, so
 * a course the rule names is never counted twice.
 */
function fillerCodes(
  subject: string,
  level: number,
  count: number,
  used: Map<string, unknown>,
) {
  const codes: string[] = [];
  for (let serial = 999; codes.length < count && serial >= 900; serial -= 1) {
    const code = `${subject}${level}${String(serial).padStart(3, "0")}`;
    if (!used.has(code)) codes.push(code);
  }
  return codes;
}

function addUnits(draft: Draft, units: number, subject: string, level: number) {
  const count = Math.ceil(units / COURSE_UNITS);
  for (const code of fillerCodes(subject, level, count, draft.completed)) {
    draft.completed.set(code, { units: COURSE_UNITS, mark: 75 });
  }
}

/**
 * Satisfies a rule completely, or about half of it, so a reviewer can see
 * every state a student might be in without touching anyone's record.
 */
function satisfy(node: CourseRuleExpression, draft: Draft, share: number) {
  const partial = share < 1;
  switch (node.kind) {
    case "group": {
      const needed =
        node.operator === "all_of"
          ? node.conditions.length
          : node.operator === "any_of"
            ? 1
            : (node.minimumCount ?? 1);
      const target = partial ? Math.floor(needed / 2) : needed;
      node.conditions
        .slice(0, node.operator === "all_of" ? undefined : target)
        .forEach((child, index) => {
          if (node.operator === "all_of") {
            satisfy(child, draft, partial && index % 2 === 1 ? 0 : share);
          } else {
            satisfy(child, draft, 1);
          }
        });
      return;
    }
    case "course":
      if (share === 0) return;
      draft.completed.set(node.code, {
        units: COURSE_UNITS,
        mark: Math.max(node.minimumMark ?? 0, 75),
      });
      return;
    case "units_total":
      addUnits(draft, Math.floor(node.units * share), "ZZSA", 1);
      return;
    case "subject_units":
      addUnits(
        draft,
        Math.floor(node.units * share),
        node.subject ?? "ZZSA",
        1,
      );
      return;
    case "level_units":
      addUnits(
        draft,
        Math.floor(node.units * share),
        node.subject ?? "ZZSA",
        node.minimumLevel / 1000,
      );
      return;
    case "course_set_units": {
      const count = Math.ceil((node.units * share) / COURSE_UNITS);
      for (const code of node.courseCodes.slice(0, count)) {
        draft.completed.set(code, { units: COURSE_UNITS, mark: 75 });
      }
      return;
    }
    case "year_standing":
      draft.studyYear = Math.max(
        draft.studyYear,
        partial ? Math.max(1, node.minimumYear - 1) : node.minimumYear,
      );
      return;
    case "structure":
      if (!partial && node.structureCode)
        draft.programmeCodes.add(node.structureCode);
      return;
    case "structure_set":
      if (!partial && node.structureCodes[0])
        draft.programmeCodes.add(node.structureCodes[0]);
      return;
    case "wam":
      draft.wam = partial
        ? node.minimumWam - 3
        : Math.max(node.minimumWam + 5, 75);
      return;
    case "gpa":
      draft.gpa = partial
        ? Math.max(0, node.minimumGpa - 0.5)
        : Math.min(7, node.minimumGpa + 0.8);
      return;
    case "incompatible":
    case "tagged_units":
    case "elective_units":
    case "permission":
    case "other":
      return;
  }
}

/** A made-up student for previewing how a course's requisites read. */
export function sampleStudent(
  expression: CourseRuleExpression | null,
  sample: SampleStudent,
): StudentRecord {
  const draft: Draft = {
    completed: new Map(),
    programmeCodes: new Set(),
    wam: null,
    gpa: null,
    studyYear: 1,
  };
  if (expression && sample !== "new") {
    satisfy(expression, draft, sample === "complete" ? 1 : 0.5);
  }
  return {
    completed: draft.completed,
    enrolled: new Set(),
    programmeCodes: [...draft.programmeCodes],
    wam: draft.wam,
    gpa: draft.gpa,
    studyYear: draft.studyYear,
  };
}
