import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { expect, test } from "vitest";

import type {
  RequirementTreeGroup,
  RequirementTreeNode,
} from "@/lib/coursemap/requirement-tree-node";
import type { StructureDetails } from "@/lib/coursemap/structure-types";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { StructureDetailView } from "@/ui/requirements/structure-detail-view";
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

function rule(
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

const requirements = group(
  "all_of",
  [
    rule([], {
      conditionKind: "level_units",
      minimumUnits: null,
      maximumUnits: 12,
      maximumLevel: 1999,
      scope: "degree",
    }),
    rule([], {
      conditionKind: "other",
      minimumUnits: null,
      freeText: "which must be completed twice, in consecutive semesters",
    }),
    rule(["COMP1100", "COMP1110"], { minimumUnits: 12, minimumCourses: 2 }),
    rule(["COMP2100", "COMP2300"], { minimumUnits: 6, minimumCourses: 1 }),
    group(
      "any_of",
      [
        rule(["COMP4550"], { minimumUnits: 12, minimumCourses: 1 }),
        rule(["COMP4500"], { minimumUnits: 12, minimumCourses: 1 }),
      ],
      { minimumUnits: 12 },
    ),
    rule([], { conditionKind: "elective_units", minimumUnits: 18 }),
  ],
  { minimumUnits: 48 },
);

const structure: StructureDetails = {
  code: "TEST-MAJ",
  kind: "major",
  year: 2026,
  name: "Testing Systems",
  acronym: null,
  shortName: null,
  introduction: "Learn to test.",
  description: null,
  units: 48,
  durationYears: null,
  academicCareer: "Undergraduate",
  college: "ANU College of Systems and Society",
  modeOfDelivery: "In Person",
  selectionRank: null,
  atar: null,
  studyAs: null,
  contactText: null,
  sections: [],
  learningOutcomes: [],
  fees: [],
  relationships: [],
  requirements,
};

function renderView(tab: string, shown: StructureDetails = structure) {
  return render(
    <TooltipProvider>
      <Tabs value={tab}>
        <StructureDetailView
          structure={shown}
          treeContext={readingTreeContext({
            academicYear: 2026,
            courses: [
              "COMP1100",
              "COMP1110",
              "COMP2100",
              "COMP2300",
              "COMP4500",
              "COMP4550",
            ].map((code) => clarityCourse(code)),
            unitTarget: 48,
          })}
        />
      </Tabs>
    </TooltipProvider>,
  );
}

test("the header carries the kind, year and code once, with the facts in one line", () => {
  renderView("overview");
  expect(
    screen.getByRole("heading", { level: 1, name: "Testing Systems" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Major · 2026 ·/u)).toHaveTextContent("TEST-MAJ");
  expect(
    screen.getByText(
      "48 units · ANU College of Systems and Society · Undergraduate · In Person",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "At a glance" })).toBeNull();
});

test("the overview shows how the units divide between the stages", () => {
  renderView("overview");
  const card = screen
    .getByRole("heading", { name: "Structure" })
    .closest("[data-slot=card]") as HTMLElement;
  expect(
    within(card).getByRole("img", { name: /48 units of 48 units/u }),
  ).toBeInTheDocument();
  const legend = within(card).getAllByRole("listitem");
  expect(legend.map((item) => item.textContent)).toEqual([
    "Compulsory courses12 units",
    "Course choices6 units",
    "Choose one option12 units",
    "Electives18 units",
  ]);
});

test("requirements read as stages with pathways side by side and limits last", async () => {
  renderView("requirements");
  const headings = screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings).toEqual([
    "Compulsory courses",
    "Course choices",
    "Choose one option",
    "Electives",
    "Limits",
    "Notes",
  ]);
  const pathways = screen
    .getByRole("heading", { name: "Choose one option" })
    .closest("section") as HTMLElement;
  expect(within(pathways).getByText("Option 1")).toBeInTheDocument();
  expect(within(pathways).getByText("Option 2")).toBeInTheDocument();
  expect(within(pathways).queryByText("or")).toBeNull();
  expect(screen.queryByText("Additional requirement")).toBeNull();
  expect(
    screen.getByText("which must be completed twice, in consecutive semesters"),
  ).toBeInTheDocument();

  // With no plan behind the page there is nothing to tick off, so the
  // courses are in view from the start and a reader folds what they have read.
  const compulsory = screen
    .getByRole("heading", { name: "Compulsory courses" })
    .closest("section") as HTMLElement;
  expect(
    within(compulsory).getByRole("link", { name: "COMP1100" }),
  ).toBeVisible();
  await userEvent.click(
    within(compulsory).getByRole("button", { name: /Hide courses/u }),
  );
  expect(
    within(compulsory).queryByRole("link", { name: "COMP1100" }),
  ).toBeNull();
});

function requirementsSection(name: string) {
  return screen
    .getByRole("heading", { level: 2, name })
    .closest("section") as HTMLElement;
}

test("a titled choice inside a pathway names itself once", () => {
  const honours = group(
    "any_of",
    [
      rule(["COMP4550"], { minimumUnits: 12, minimumCourses: 1 }),
      rule(["COMP4500"], { minimumUnits: 12, minimumCourses: 1 }),
    ],
    { title: "Honours research" },
  );
  const pathways = group("any_of", [
    honours,
    group("all_of", [rule(["COMP2100"], { minimumUnits: 12 })], {
      title: "Team project",
    }),
  ]);
  renderView("requirements", {
    ...structure,
    requirements: group("all_of", [pathways], { minimumUnits: 48 }),
  });
  expect(screen.getAllByText("Honours research")).toHaveLength(1);
  expect(screen.getAllByText("Team project")).toHaveLength(1);
});

test("a choice inside a named set says how many to choose", () => {
  const choice = group(
    "at_least",
    [
      rule(["COMP4550"], { minimumUnits: 12, minimumCourses: 1 }),
      rule(["COMP4500"], { minimumUnits: 12, minimumCourses: 1 }),
      rule(["COMP2100"], { minimumUnits: 12, minimumCourses: 1 }),
    ],
    { minimumCount: 2 },
  );
  renderView("requirements", {
    ...structure,
    requirements: group(
      "all_of",
      [
        group(
          "all_of",
          [rule(["COMP1100"], { minimumUnits: 6, minimumCourses: 1 }), choice],
          { title: "Advanced study" },
        ),
      ],
      { minimumUnits: 48 },
    ),
  });
  const set = requirementsSection("Advanced study");
  expect(within(set).getByText("Choose at least 2")).toBeInTheDocument();
  expect(within(set).getByText("Option 1")).toBeInTheDocument();
});

test("a pathway stage ANU names keeps its title and still says how many to choose", () => {
  const choice = group(
    "any_of",
    [
      rule(["COMP4550"], { minimumUnits: 12, minimumCourses: 1 }),
      rule(["COMP4500"], { minimumUnits: 12, minimumCourses: 1 }),
    ],
    { title: "Capstone", description: "Research or industry." },
  );
  renderView("requirements", {
    ...structure,
    requirements: group("all_of", [choice], { minimumUnits: 48 }),
  });
  const stage = requirementsSection("Capstone");
  expect(within(stage).getByText("Research or industry.")).toBeInTheDocument();
  expect(within(stage).getByText("Choose one")).toBeInTheDocument();
  expect(within(stage).getAllByText("Capstone")).toHaveLength(1);
});

test("notes keep ANU's formatting, name their kind and skip empty wording", () => {
  renderView("requirements", {
    ...structure,
    requirements: group(
      "all_of",
      [
        rule([], {
          conditionKind: "other",
          minimumUnits: null,
          freeText:
            "Before placement:\n\n- a **police check**\n- a first aid course",
          noteKind: "required",
        }),
        rule([], {
          conditionKind: "other",
          minimumUnits: null,
          freeText: "Some combinations need the convener's approval.",
          noteKind: "check_with_anu",
        }),
        rule([], {
          conditionKind: "other",
          minimumUnits: null,
          freeText: "   ",
          sourceText: "",
        }),
        rule([], {
          conditionKind: "structure",
          itemCode: "BADAN",
          matchesStructure: false,
          minimumUnits: null,
          options: [],
        }),
      ],
      { minimumUnits: 48 },
    ),
  });
  expect(
    screen.queryByRole("heading", { level: 2, name: /Majors|Academic/u }),
  ).toBeNull();
  const notes = requirementsSection("Notes");
  // The blank note is left out rather than drawn as an empty row.
  expect(notes.querySelectorAll(":scope > div > ul > li")).toHaveLength(3);
  expect(within(notes).getByText("Required")).toBeInTheDocument();
  expect(within(notes).getByText("Check with ANU")).toBeInTheDocument();
  expect(
    within(notes).getByText("police check").closest("strong"),
  ).not.toBeNull();
  expect(
    within(notes).getByText("a first aid course").closest("li"),
  ).not.toBeNull();
  expect(within(notes).getByText("Not enrolled in BADAN")).toBeInTheDocument();
  expect(within(notes).queryByText(/\*\*/u)).toBeNull();
});

test("rows in the limits stage do not each repeat that they are limits", () => {
  renderView("requirements");
  const limits = requirementsSection("Limits");
  expect(within(limits).queryByText("Limit")).toBeNull();
});

test("fees ANU states in prose render their links", () => {
  renderView("overview", {
    ...structure,
    fees: [
      {
        position: 0,
        feeYear: 2026,
        audience: "domestic",
        feeType: "other",
        amount: null,
        currency: null,
        basis: "unknown",
        sourceLabel: null,
        sourceText:
          "[Services and amenities fee](https://www.anu.edu.au/students/program-administration/costs-fees)",
      },
    ],
  });
  expect(
    screen.getByRole("link", { name: "Services and amenities fee" }),
  ).toHaveAttribute(
    "href",
    "https://www.anu.edu.au/students/program-administration/costs-fees",
  );
  expect(screen.queryByText(/\[Services and amenities fee\]/u)).toBeNull();
});
