import { expect, test, vi } from "vitest";
const { loadListed, loadPage, loadClosest } = vi.hoisted(() => ({
  loadListed: vi.fn().mockResolvedValue([]),
  loadPage: vi.fn().mockResolvedValue({ courses: [] }),
  loadClosest: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCoursesByCodes: loadListed,
  loadPublishedCoursePage: loadPage,
}));
vi.mock("@/lib/coursemap/planning-course-editions", () => ({
  loadClosestCourseEditions: loadClosest,
}));
vi.mock("@/lib/coursemap/plan-catalogue", () => ({
  planCourseFromDetails: (course: unknown) => course,
}));
import { withRequirementCourses } from "@/lib/coursemap/requirement-courses";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { clarityRule } from "./fixtures/requirement-clarity";

function catalogueWithRules() {
  const catalogue = readingTreeContext({ academicYear: 2025 }).catalogue;
  catalogue.structureRequirements = [
    {
      snapshotId: 1,
      structureCode: "TEST",
      structureKind: "programme",
      structureName: "Test",
      unmodelled: [],
      root: {
        type: "group",
        id: 1,
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
        scope: "part",
        children: [
          clarityRule(),
          clarityRule({
            id: 902,
            conditionKind: "subject_units",
            subjectCode: "COMP",
            options: [],
          }),
        ],
      },
    },
  ];
  return catalogue;
}

test("requirements load named courses for titles but leave rule browsing lazy", async () => {
  await withRequirementCourses(catalogueWithRules(), {
    includeRuleCandidates: false,
  });
  expect(loadListed).toHaveBeenCalledWith(
    ["COMP1100", "COMP1110", "COMP2100"],
    2025,
  );
  expect(loadPage).not.toHaveBeenCalled();
});

test("a named course its year does not publish comes from the nearest year", async () => {
  loadListed.mockResolvedValueOnce([{ code: "COMP1100", year: 2025 }]);
  loadClosest.mockResolvedValueOnce([{ code: "COMP1110", year: 2024 }]);
  const { courses } = await withRequirementCourses(catalogueWithRules(), {
    includeRuleCandidates: false,
  });
  expect(loadClosest).toHaveBeenLastCalledWith(["COMP1110", "COMP2100"], 2025);
  expect(courses).toEqual([
    { code: "COMP1100", year: 2025 },
    { code: "COMP1110", year: 2024 },
  ]);
});
