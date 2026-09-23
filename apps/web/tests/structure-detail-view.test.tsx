import { render, screen } from "@testing-library/react";
import { Tabs } from "@coursemap/ui/primitives/tabs";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { expect, test } from "vitest";

import type { StructureDetails } from "@/lib/coursemap/structure-types";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { StructureDetailView } from "@/ui/requirements/structure-detail-view";

function structure(
  overrides: Partial<StructureDetails> = {},
): StructureDetails {
  return {
    code: "AARB-MIN",
    kind: "minor",
    year: 2026,
    name: "Advanced Arabic",
    acronym: null,
    shortName: null,
    introduction: "Build on intermediate Arabic.",
    description: null,
    units: 24,
    durationYears: null,
    academicCareer: "Undergraduate",
    college: "ANU College of Arts and Social Sciences",
    modeOfDelivery: null,
    selectionRank: null,
    atar: null,
    studyAs: null,
    contactText: null,
    sections: [],
    learningOutcomes: [],
    fees: [],
    relationships: [],
    requirements: null,
    ...overrides,
  };
}

function renderView(tab: string, details: StructureDetails) {
  return render(
    <TooltipProvider>
      <Tabs value={tab}>
        <StructureDetailView
          structure={details}
          treeContext={readingTreeContext({ academicYear: 2026 })}
        />
      </Tabs>
    </TooltipProvider>,
  );
}

test("a minor names the degrees it is offered in, by title", () => {
  renderView(
    "overview",
    structure({
      relationships: [
        {
          position: 1,
          relationshipKind: "offered_in",
          targetKind: "programme",
          targetCode: "BARTS",
          targetTitle: "Bachelor of Arts",
        },
        {
          position: 2,
          relationshipKind: "offered_in",
          targetKind: "programme",
          targetCode: "ELANG",
          targetTitle: "Diploma of Languages",
        },
      ],
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Offered in" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Bachelor of Arts/u }),
  ).toHaveAttribute("href", "/programmes/2026/barts");
  expect(screen.queryByText(/Mentioned by the ANU page/u)).toBeNull();
});

test("a programme groups the structures it offers by kind", () => {
  renderView(
    "overview",
    structure({
      code: "AACOM",
      kind: "programme",
      relationships: [
        {
          position: 1,
          relationshipKind: "option",
          targetKind: "specialisation",
          targetCode: "ARIN-SPEC",
          targetTitle: "Artificial Intelligence",
        },
      ],
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Choose from" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Specialisations" }),
  ).toBeInTheDocument();
});

test("information reads as tidy sections without a jump list for one card", () => {
  renderView(
    "information",
    structure({
      sections: [
        {
          position: 1,
          sectionKey: "first_year_advice",
          heading: "First-year advice",
          markdown:
            "- MATH1115 Advanced Mathematics and Applications 1\n- MATH1116 Advanced Mathematics and Applications 2",
        },
      ],
    }),
  );
  expect(
    screen.getByRole("heading", { name: "First-year advice" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByText(/Back to the top/iu)).toBeNull();
});
