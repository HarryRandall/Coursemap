import { expect, test } from "vitest";
import { requirementTitle } from "@/lib/coursemap/requirement-titles";
import {
  courseListTitle,
  conditionHeading,
  conditionInterpretation,
  conditionSummary,
  courseSearchHref,
} from "@/ui/requirements/requirement-presentation";
import { structuresToPlan } from "@/ui/plan/plan-suggestions";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { requirementNodeMatcher } from "@/lib/coursemap/requirement-progress";
import {
  boundedRequirement,
  requirementLevelFilter,
} from "@/lib/coursemap/requirement-course-filters";
import { courseLevelBounds } from "@/lib/coursemap/course-level-filter";
import { clarityCourse, clarityRule } from "./fixtures/requirement-clarity";

const courses = [
  clarityCourse("COMP1100"),
  clarityCourse("COMP1110"),
  clarityCourse("COMP2100"),
];

test.each([
  [1, null, "Pick one: COMP1100, COMP1110 or COMP2100"],
  [3, null, "Take COMP1100, COMP1110 and COMP2100"],
  [4, null, "Take COMP1100, COMP1110 and COMP2100"],
  [null, 6, "Pick one: COMP1100, COMP1110 or COMP2100"],
  [null, 12, "Pick 2 of 3 courses"],
  [null, 18, "Take COMP1100, COMP1110 and COMP2100"],
  [null, null, "Pick from 3 courses"],
])(
  "titles agree for count %s and units %s",
  (minimumCourses, minimumUnits, expected) => {
    const rule = clarityRule({ minimumCourses, minimumUnits });
    expect(requirementTitle(rule, courses)).toBe(expected);
    expect(conditionHeading(rule, courses)).toBe(expected);
    expect(conditionSummary(rule, courses)).toBe(expected);
    expect(
      courseListTitle(
        rule,
        courses.map((course) => course.code),
        false,
        courses,
      ),
    ).toBe(expected);
    const context = readingTreeContext({ academicYear: 2026, courses });
    const root = {
      type: "group" as const,
      id: 1,
      children: [rule],
      description: null,
      groupKey: "root",
      maximumUnits: null,
      minimumCount: null,
      minimumUnits: null,
      operator: "all_of",
      position: 0,
      sourceLocator: "",
      sourceText: "",
      title: "",
      scope: "part" as const,
    };
    const result = structuresToPlan({
      structures: [
        { code: "TEST", kind: "programme", name: "Test", root, context },
      ],
      catalogue: context.catalogue,
    });
    expect(result[0]!.rules[0]!.heading).toBe(expected);
  },
);

test("a repeatable course is titled by its allowance, not one attempt", () => {
  const thesis = clarityRule({
    minimumUnits: 48,
    options: [
      {
        code: "CHEM4005",
        kind: "course",
        position: 1,
        structureKind: null,
        maximumUnits: 48,
      },
    ],
  });
  const thesisCourses = [clarityCourse("CHEM4005", 12)];
  expect(requirementTitle(thesis, thesisCourses)).toBe("Take CHEM4005");
  expect(conditionInterpretation(thesis)).toContain(
    "CHEM4005 may be repeated, up to 48 units",
  );

  const topics = clarityRule({
    minimumUnits: 12,
    options: [
      ...clarityRule().options,
      {
        code: "COMP3900",
        kind: "course",
        position: 4,
        structureKind: null,
        maximumUnits: 24,
      },
    ],
  });
  expect(
    requirementTitle(topics, [...courses, clarityCourse("COMP3900")]),
  ).toBe("Pick 12 units from 4 courses");
});

test("all fixed options can have different unit values", () => {
  expect(
    requirementTitle(clarityRule({ minimumUnits: 24 }), [
      courses[0]!,
      courses[1]!,
      clarityCourse("COMP2100", 12),
    ]),
  ).toMatch(/^Take /);
});

test.each(["range", "variable", "unknown"] as const)(
  "%s units never infer a course count",
  (kind) => {
    const unitValue =
      kind === "range"
        ? { kind, minimumUnits: 6, maximumUnits: 12 }
        : { kind, options: [{ units: 6, label: null }] };
    expect(
      requirementTitle(clarityRule(), [
        { ...courses[0]!, unitValue },
        ...courses.slice(1),
      ]),
    ).toBe("Pick 12 units from 3 courses");
  },
);

test("missing catalogue units and other years do not imply pick one", () => {
  expect(requirementTitle(clarityRule({ minimumUnits: 6 }), [])).toBe(
    "Pick 6 units from 3 courses",
  );
});

test("long lists use counts and rules keep concise titles", () => {
  const rule = clarityRule({
    options: [1100, 1110, 2100, 3100].map((value, position) => ({
      code: `COMP${value}`,
      kind: "course",
      position,
      structureKind: null,
    })),
    minimumCourses: 1,
  });
  expect(requirementTitle(rule)).toBe("Pick one of 4 courses");
  expect(requirementTitle({ ...rule, minimumCourses: 4 })).toBe(
    "Take all 4 core courses",
  );
  expect(
    requirementTitle(
      clarityRule({
        conditionKind: "tagged_units",
        options: [],
        tag: "Transdisciplinary Problem-Solving",
      }),
    ),
  ).toBe("12 units tagged Transdisciplinary Problem-Solving");
  expect(
    requirementTitle(
      clarityRule({
        conditionKind: "level_units",
        options: [],
        minimumUnits: 18,
        minimumLevel: 3000,
        maximumLevel: 3000,
      }),
    ),
  ).toBe("18 units at 3000 level");
  expect(
    requirementTitle(
      clarityRule({ conditionKind: "elective_units", options: [] }),
    ),
  ).toBe("Electives");
});

test.each([
  [null, 3000, "1-3"],
  [2000, 3000, "2-3"],
  [3000, 3000, "3"],
  [3000, null, "3+"],
] as const)(
  "bounds survive matching and links: %s to %s",
  (minimumLevel, maximumLevel, level) => {
    const rule = clarityRule({
      conditionKind: "level_units",
      options: [],
      subjectCode: "COMP MATH",
      minimumLevel,
      maximumLevel,
    });
    const match = requirementNodeMatcher(rule)!;
    expect(match(clarityCourse("BIOL3100"))).toBe(false);
    expect(match(clarityCourse("COMP3100"))).toBe(true);
    expect(match(clarityCourse("MATH3100"))).toBe(true);
    expect(match(clarityCourse("COMP4100"))).toBe(maximumLevel === null);
    expect(requirementLevelFilter(minimumLevel, maximumLevel)).toBe(level);
    const href = new URL(courseSearchHref(rule, 2025)!, "http://localhost");
    expect(href.searchParams.get("level")).toBe(level);
    expect(href.searchParams.get("year")).toBe("2025");
    expect(href.searchParams.get("subject")).toBe("COMP MATH");
    expect(boundedRequirement(rule)).toBe(true);
  },
);

test("whole catalogue rules stay unbounded", () => {
  expect(boundedRequirement(clarityRule({ includesAnyCourse: true }))).toBe(
    false,
  );
  expect(
    boundedRequirement(
      clarityRule({
        conditionKind: "level_units",
        options: [],
        minimumLevel: 3000,
      }),
    ),
  ).toBe(false);
  expect(courseLevelBounds("3-2")).toBeNull();
  expect(courseLevelBounds("1-3")).toEqual({ minimum: 1000, maximum: 3000 });
});

test("the fixed-unit total requires every course even when a smaller count is present", () => {
  expect(
    requirementTitle(
      clarityRule({ minimumCourses: 1, minimumUnits: 18 }),
      courses,
    ),
  ).toBe("Take COMP1100, COMP1110 and COMP2100");
});

test("a target above the listed fixed-unit total is not labelled take all", () => {
  expect(requirementTitle(clarityRule({ minimumUnits: 30 }), courses)).toBe(
    "Pick 5 of 3 courses",
  );
  expect(
    courseSearchHref(
      clarityRule({ conditionKind: "elective_units", options: [] }),
      null,
    ),
  ).toBeNull();
});

test("planner browse links keep the selected catalogue year and inclusive level bounds", () => {
  const rule = clarityRule({
    conditionKind: "level_units",
    options: [],
    subjectCode: "COMP",
    minimumLevel: 2000,
    maximumLevel: 3000,
  });
  const context = readingTreeContext({ academicYear: 2025 });
  const root = {
    type: "group" as const,
    id: 1,
    children: [rule],
    description: null,
    groupKey: "root",
    maximumUnits: null,
    minimumCount: null,
    minimumUnits: null,
    operator: "all_of",
    position: 0,
    sourceLocator: "",
    sourceText: "",
    title: "",
    scope: "part" as const,
  };
  const result = structuresToPlan({
    structures: [
      { code: "TEST", kind: "programme", name: "Test", root, context },
    ],
    catalogue: context.catalogue,
  });
  const params = new URLSearchParams(result[0]!.rules[0]!.browse!);
  expect(params.get("year")).toBe("2025");
  expect(params.get("subject")).toBe("COMP");
  expect(params.get("level")).toBe("2-3");
});
