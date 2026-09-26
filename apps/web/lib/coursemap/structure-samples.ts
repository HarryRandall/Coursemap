import type { SampleStudent } from "@/lib/coursemap/requisite-samples";
import type { RequirementTreeNode } from "@/lib/coursemap/requirement-tree-node";
import type { Attempt, Course } from "@/lib/coursemap/types";

const COURSE_UNITS = 6;

/** Stands in for any subject where a rule names none, such as electives. */
const SAMPLE_SUBJECT = "SMPL";

function sampleCourse({
  code,
  name,
  year,
  tags = [],
}: {
  code: string;
  name: string;
  year: number;
  tags?: string[];
}): Course {
  const digit = Number(code.charAt(4));
  return {
    code,
    name,
    year,
    units: COURSE_UNITS,
    level: Number.isFinite(digit) && digit > 0 ? digit * 1000 : 1000,
    subject: code.slice(0, 4),
    school: "",
    convener: "",
    sessions: [],
    delivery: "",
    description: "",
    prerequisiteText: "",
    prerequisiteCodes: [],
    incompatibilities: [],
    countsTowards: [],
    tags,
    sourceUrl: "",
    lastChanged: "",
    parseState: "Automatic",
    accent: "violet",
  };
}

/** Levels are published on the 1000 scale but some rules record 1–9. */
function levelDigit(level: number | null) {
  if (level === null) return 1;
  return Math.min(
    9,
    Math.max(1, level < 10 ? level : Math.floor(level / 1000)),
  );
}

type Draft = {
  year: number;
  courses: Map<string, Course>;
  /** Course codes in the order a student would take them, per rule. */
  rules: string[][];
};

/**
 * Invented course codes that count towards a unit rule. They use the top of
 * each level's number range and skip any code the sample already holds, so
 * a course a rule names is never counted twice.
 */
function fillerCourses(
  draft: Draft,
  subject: string,
  level: number,
  units: number,
  name: string,
  tags: string[] = [],
) {
  const codes: string[] = [];
  const count = Math.ceil(units / COURSE_UNITS);
  for (let serial = 999; codes.length < count && serial >= 900; serial -= 1) {
    const code = `${subject}${level}${serial}`;
    if (draft.courses.has(code)) continue;
    draft.courses.set(
      code,
      sampleCourse({ code, name, year: draft.year, tags }),
    );
    codes.push(code);
  }
  return codes;
}

/** The courses that would meet one rule, or nothing for rules not met by courses. */
function meet(node: RequirementTreeNode, draft: Draft) {
  if (node.type === "group") {
    const needed =
      node.operator === "any_of"
        ? 1
        : node.operator === "at_least"
          ? Math.max(1, node.minimumCount ?? 1)
          : node.children.length;
    node.children.slice(0, needed).forEach((child) => meet(child, draft));
    return;
  }
  const units = node.minimumUnits;
  const level = levelDigit(node.minimumLevel);
  const listed = node.options.filter((option) => option.kind === "course");
  if (listed.length > 0) {
    const needed =
      node.minimumCourses ??
      (units !== null ? Math.ceil(units / COURSE_UNITS) : listed.length);
    const codes = listed.slice(0, needed).map((option) => {
      if (!draft.courses.has(option.code)) {
        draft.courses.set(
          option.code,
          sampleCourse({
            code: option.code,
            name: option.title ?? option.code,
            year: draft.year,
          }),
        );
      }
      return option.code;
    });
    draft.rules.push(codes);
    return;
  }
  if (units === null) return;
  switch (node.conditionKind) {
    case "subject_units":
      if (node.subjectCode) {
        draft.rules.push(
          fillerCourses(
            draft,
            node.subjectCode,
            level,
            units,
            `Sample ${node.subjectCode} course`,
          ),
        );
      }
      return;
    case "tagged_units":
      draft.rules.push(
        fillerCourses(
          draft,
          SAMPLE_SUBJECT,
          level,
          units,
          `Sample ${node.tag ?? "tagged"} course`,
          node.tag ? [node.tag] : [],
        ),
      );
      return;
    case "level_units":
    case "elective_units":
      draft.rules.push(
        fillerCourses(draft, SAMPLE_SUBJECT, level, units, "Sample elective"),
      );
      return;
    default:
      return;
  }
}

/**
 * A made-up student for previewing a programme, major or minor: nothing yet,
 * about half of each rule completed with the next course planned, or every
 * rule met. Courses the structure names are used as listed; rules that only
 * describe courses get invented ones, so every progress state can be checked
 * without a real record.
 */
export function sampleStructurePlan(
  root: RequirementTreeNode | null,
  reader: SampleStudent,
  year: number,
): { courses: Course[]; attempts: Attempt[] } {
  const draft: Draft = { year, courses: new Map(), rules: [] };
  if (root && reader !== "new") meet(root, draft);
  const attempts: Attempt[] = [];
  const seen = new Set<string>();
  for (const codes of draft.rules) {
    // Partway completes the first half of a rule and plans the next course,
    // so a one-course rule reads as planned rather than already met.
    const completed =
      reader === "complete" ? codes.length : Math.floor(codes.length / 2);
    codes.forEach((code, index) => {
      if (seen.has(code)) return;
      const status =
        index < completed
          ? "completed"
          : reader === "partway" && index === completed
            ? "planned"
            : null;
      if (!status) return;
      seen.add(code);
      attempts.push({
        id: `sample-${code}`,
        courseCode: code,
        academicYear: year,
        termId: "sample",
        status,
        ...(status === "completed" ? { mark: 75 } : {}),
      });
    });
  }
  return { courses: [...draft.courses.values()], attempts };
}
