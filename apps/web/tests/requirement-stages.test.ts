import { expect, test } from "vitest";
import {
  pathwayInstruction,
  pathwaysTitle,
  requirementStages,
  ruleMinimumUnits,
  structureComposition,
} from "@/lib/coursemap/requirement-stages";
import type {
  RequirementTreeGroup,
  RequirementTreeNode,
} from "@/lib/coursemap/requirement-tree-node";
import { clarityCourse, clarityRule } from "./fixtures/requirement-clarity";

let nextId = 1;

function group(
  operator: string,
  children: RequirementTreeNode[],
  overrides: Partial<RequirementTreeGroup> = {},
): RequirementTreeGroup {
  const id = nextId++;
  return {
    type: "group",
    children,
    description: null,
    groupKey: `g${id}`,
    id,
    maximumUnits: null,
    minimumCount: null,
    minimumUnits: null,
    operator,
    position: id,
    sourceLocator: "",
    sourceText: "",
    title: null,
    scope: "part",
    ...overrides,
  };
}

function courseRule(
  codes: string[],
  overrides: Partial<ReturnType<typeof clarityRule>> = {},
) {
  const id = nextId++;
  return clarityRule({
    id,
    projectionKey: `c${id}`,
    position: id,
    options: codes.map((code, position) => ({
      code,
      kind: "course",
      position,
      structureKind: null,
    })),
    ...overrides,
  });
}

/** The Advanced Computing programme as imported, with its rules out of order. */
function advancedComputing() {
  const firstYearCap = courseRule([], {
    conditionKind: "level_units",
    minimumUnits: null,
    maximumUnits: 60,
    maximumLevel: 1999,
    scope: "degree",
  });
  const honoursLevel = courseRule([], {
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumUnits: 48,
    minimumLevel: 4000,
    scope: "degree",
  });
  const fragment = courseRule([], {
    conditionKind: "other",
    minimumUnits: null,
    freeText: "which must be completed twice, in consecutive semesters",
  });
  const pickOne = courseRule(["COMP1100", "COMP1130"], {
    minimumUnits: 6,
    minimumCourses: 1,
  });
  const core = courseRule(["COMP2100", "COMP2300", "COMP2420", "COMP3600"], {
    minimumUnits: 24,
    minimumCourses: 4,
  });
  const specialisation = courseRule([], {
    conditionKind: "structure_set",
    minimumUnits: 24,
    minimumCourses: 1,
    options: [
      {
        code: "ARIN-SPEC",
        kind: "structure",
        position: 0,
        structureKind: "specialisation",
      },
      {
        code: "MACL-SPEC",
        kind: "structure",
        position: 1,
        structureKind: "specialisation",
      },
    ],
  });
  const breadth = courseRule([], {
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumUnits: 18,
    minimumLevel: 3000,
  });
  const research = courseRule(["COMP4550"], {
    minimumUnits: 24,
    minimumCourses: 1,
  });
  const teamProject = group(
    "all_of",
    [
      courseRule(["COMP4500"], { minimumUnits: 12, minimumCourses: 1 }),
      courseRule([], {
        conditionKind: "subject_units",
        subjectCode: "COMP",
        minimumUnits: 12,
        minimumLevel: 4000,
      }),
    ],
    { minimumUnits: 24 },
  );
  const pathways = group("any_of", [research, teamProject], {
    minimumUnits: 24,
  });
  const electives = courseRule([], {
    conditionKind: "elective_units",
    minimumUnits: 96,
  });
  const body = group(
    "all_of",
    [pickOne, core, specialisation, breadth, pathways, electives],
    { minimumUnits: 192 },
  );
  return group("all_of", [firstYearCap, honoursLevel, fragment, body], {
    minimumUnits: 192,
    title: "Program Requirements",
  });
}

test("rules are regrouped into stages a reader recognises, in reading order", () => {
  const stages = requirementStages(advancedComputing(), {
    unitTarget: 192,
    showStructureOptions: true,
  });
  expect(stages.map((stage) => [stage.kind, stage.title, stage.units])).toEqual(
    [
      ["compulsory", "Compulsory courses", 24],
      ["choices", "Course choices", 6],
      ["pathways", "Choose one pathway", 24],
      ["structures", "Specialisations", 24],
      ["breadth", "Level and subject rules", null],
      ["electives", "Electives", 96],
      ["degree", "Across the whole degree", null],
      ["limits", "Limits", null],
      ["notes", "Notes", null],
    ],
  );
});

test("a wrapper group that repeats the unit target does not become a stage of its own", () => {
  const stages = requirementStages(advancedComputing(), { unitTarget: 192 });
  expect(stages.filter((stage) => stage.kind === "set")).toHaveLength(0);
  // Without a chooser of its own, a surface hides structure options.
  expect(stages.some((stage) => stage.kind === "structures")).toBe(false);
});

test("a labelled group keeps its name and its own stage", () => {
  const root = group("all_of", [
    group(
      "all_of",
      [
        courseRule(["MATH1013", "MATH1014"], {
          minimumUnits: 12,
          minimumCourses: 2,
        }),
      ],
      { title: "Mathematics foundation", minimumUnits: 12 },
    ),
  ]);
  const [stage] = requirementStages(root, { unitTarget: 48 });
  expect(stage.kind).toBe("set");
  expect(stage.title).toBe("Mathematics foundation");
  expect(stage.units).toBe(12);
});

test("a course list without a unit figure is sized from its courses", () => {
  const courses = [
    clarityCourse("COMP1100"),
    clarityCourse("COMP1110"),
    clarityCourse("COMP2100", 12),
  ];
  const required = courseRule(["COMP1100", "COMP1110", "COMP2100"], {
    minimumUnits: null,
    minimumCourses: 3,
  });
  expect(ruleMinimumUnits(required, courses)).toBe(24);
  const pickTwo = courseRule(["COMP1100", "COMP1110"], {
    minimumUnits: null,
    minimumCourses: 1,
  });
  expect(ruleMinimumUnits(pickTwo, courses)).toBe(6);
  const unknown = courseRule(["COMP9999"], {
    minimumUnits: null,
    minimumCourses: 1,
  });
  expect(ruleMinimumUnits(unknown, courses)).toBeNull();
});

test("the composition draws the stages that fill the degree and leaves level rules out", () => {
  const stages = requirementStages(advancedComputing(), {
    unitTarget: 192,
    showStructureOptions: true,
  });
  const composition = structureComposition(stages, 192);
  // The 18 units of 3000-level COMP come from courses other stages count,
  // so a share of their own would draw those units twice.
  expect(composition?.allocated).toBe(174);
  expect(composition?.unallocated).toBe(18);
  expect(composition?.complete).toBe(true);
  expect(composition?.segments.map((segment) => segment.kind)).toEqual([
    "compulsory",
    "choices",
    "pathways",
    "structures",
    "electives",
  ]);
});

/** Bachelor of Computing 2026 as published: degree-wide rules in a group of their own. */
function bachelorOfComputing() {
  const degreeRules = group(
    "all_of",
    [
      courseRule([], {
        conditionKind: "units_total",
        minimumUnits: 144,
        scope: "degree",
      }),
      courseRule([], {
        conditionKind: "other",
        minimumUnits: 12,
        freeText: "A minimum of 12 units of Transdisciplinary courses",
        scope: "degree",
      }),
      courseRule([], {
        conditionKind: "subject_units",
        subjectCode: "COMP",
        minimumUnits: 24,
        minimumLevel: 3000,
        scope: "degree",
      }),
      courseRule([], {
        conditionKind: "level_units",
        minimumUnits: null,
        maximumUnits: 60,
        maximumLevel: 1999,
        scope: "degree",
      }),
    ],
    { title: "Degree-wide rules", scope: "degree" },
  );
  const lists = group(
    "all_of",
    [courseRule(["COMP1100"], { minimumUnits: 96, minimumCourses: 1 })],
    {
      title: "A minimum of 96 units from the following lists",
      minimumUnits: 96,
    },
  );
  const electives = courseRule([], {
    conditionKind: "elective_units",
    minimumUnits: 48,
  });
  return group("all_of", [degreeRules, lists, electives], {
    minimumUnits: 144,
  });
}

test("a degree-wide group constrains the degree without claiming units", () => {
  const stages = requirementStages(bachelorOfComputing(), { unitTarget: 144 });
  expect(stages.map((stage) => [stage.kind, stage.title, stage.units])).toEqual(
    [
      ["set", "A minimum of 96 units from the following lists", 96],
      ["electives", "Electives", 48],
      ["degree", "Degree-wide rules", null],
    ],
  );
  const composition = structureComposition(stages, 144);
  expect(composition?.allocated).toBe(144);
  expect(composition?.segments.map((segment) => segment.title)).toEqual([
    "A minimum of 96 units from the following lists",
    "Electives",
  ]);
});

test("a degree-wide rule adds nothing to the group around it", () => {
  const set = group("all_of", [
    courseRule(["COMP1100"], { minimumUnits: 6, minimumCourses: 1 }),
    courseRule([], {
      conditionKind: "subject_units",
      subjectCode: "COMP",
      minimumUnits: 24,
      minimumLevel: 3000,
      scope: "degree",
    }),
  ]);
  expect(ruleMinimumUnits(set)).toBe(6);
});

test("a choice between course lists is a choice of options, not pathways", () => {
  const choice = group("any_of", [
    courseRule(["COMP4550"], { minimumUnits: 12, minimumCourses: 1 }),
    courseRule(["COMP4500"], { minimumUnits: 12, minimumCourses: 1 }),
  ]);
  const [stage] = requirementStages(group("all_of", [choice]));
  expect(stage.title).toBe("Choose one option");
  expect(
    pathwaysTitle(group("at_least", choice.children, { minimumCount: 2 })),
  ).toBe("Choose 2 options");
});

test("a choice ANU names keeps its name as the stage title", () => {
  const choice = group(
    "any_of",
    [
      courseRule(["COMP4550"], { minimumUnits: 12, minimumCourses: 1 }),
      group("all_of", [courseRule(["COMP4500"], { minimumUnits: 12 })]),
    ],
    { title: "Honours pathway", description: "Pick a research or team route." },
  );
  const [stage] = requirementStages(group("all_of", [choice]));
  expect(stage.kind).toBe("pathways");
  expect(stage.title).toBe("Honours pathway");
  expect(pathwayInstruction(choice)).toBe("Choose one");
  expect(pathwayInstruction(group("at_least", [], { minimumCount: 2 }))).toBe(
    "Choose at least 2",
  );
});

test("a structure the student must not be enrolled in is a note, not a structure to take", () => {
  const notEnrolled = courseRule([], {
    conditionKind: "structure",
    itemCode: "BADAN",
    matchesStructure: false,
    minimumUnits: null,
    options: [],
  });
  const enrolled = courseRule([], {
    conditionKind: "structure",
    itemCode: "BCOMP",
    minimumUnits: null,
    options: [],
  });
  const stages = requirementStages(group("all_of", [notEnrolled, enrolled]), {
    showStructureOptions: true,
  });
  expect(stages.map((stage) => [stage.kind, stage.rules.length])).toEqual([
    ["structures", 1],
    ["notes", 1],
  ]);
});

test("stages that overlap the target cannot be drawn as shares of one bar", () => {
  const root = group("all_of", [
    courseRule(["INFS1001", "INFS2024"], {
      minimumUnits: 12,
      minimumCourses: 2,
    }),
    courseRule(["INFS3024", "INFS3059", "COMP2120"], {
      minimumUnits: 18,
      minimumCourses: 3,
    }),
  ]);
  const stages = requirementStages(root, { unitTarget: 24 });
  expect(structureComposition(stages, 24)).toBeNull();
  expect(structureComposition(stages, null)?.unallocated).toBeNull();
});
