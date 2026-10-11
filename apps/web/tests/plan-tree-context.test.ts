import { expect, test } from "vitest";
import { planTreeContext } from "@/ui/requirements/plan-tree-context";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { clarityCourse, clarityRule } from "./fixtures/requirement-clarity";
const courses = [
  clarityCourse("COMP1100"),
  clarityCourse("COMP1110"),
  clarityCourse("COMP2100"),
];

test("placement labels include structure context and distinguish colliding titles", () => {
  const rule = clarityRule({
    minimumUnits: 6,
    options: courses.map((course, position) => ({
      code: course.code,
      kind: "course",
      position,
      structureKind: null,
    })),
  });
  const root = {
    type: "group" as const,
    id: 1,
    children: [
      rule,
      {
        ...rule,
        id: 902,
        projectionKey: "other",
        options: [
          rule.options[0]!,
          { ...rule.options[1]!, code: "MATH1110" },
          rule.options[2]!,
        ],
      },
    ],
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
  const catalogue = readingTreeContext({
    academicYear: 2026,
    courses: [],
  }).catalogue;
  catalogue.courses = courses.map((course) => ({
    ...course,
    unitValue: { kind: "unknown", options: [] },
  }));
  const context = planTreeContext({
    structureCode: "TEST",
    root,
    catalogue,
    attempts: [
      {
        id: "a",
        courseCode: "COMP1100",
        termId: "2026-s1",
        academicYear: 2026,
        status: "planned",
      },
    ],
    placements: [],
    statuses: new Map(),
    selectedStructureCodes: new Set(),
    unitTarget: null,
    onPlace: () => {},
  });
  const options = context.placement!.optionsFor("COMP1100");
  expect(options).toHaveLength(2);
  expect(new Set(options.map((option) => option.label)).size).toBe(2);
  expect(
    options.every((option) =>
      option.label.startsWith("TEST · Pick 6 units from 3 courses · "),
    ),
  ).toBe(true);
});
