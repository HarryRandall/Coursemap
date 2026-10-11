import { expect, test, vi } from "vitest";
const { loadListed, loadPage } = vi.hoisted(() => ({
  loadListed: vi.fn().mockResolvedValue([]),
  loadPage: vi.fn().mockResolvedValue({ courses: [] }),
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCoursesByCodes: loadListed,
  loadPublishedCoursePage: loadPage,
}));
vi.mock("@/lib/coursemap/plan-catalogue", () => ({
  planCourseFromDetails: (course: unknown) => course,
}));
import { withRequirementCourses } from "@/lib/coursemap/requirement-courses";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import { clarityRule } from "./fixtures/requirement-clarity";

test("requirements load named courses for titles but leave rule browsing lazy", async () => {
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
  await withRequirementCourses(catalogue, { includeRuleCandidates: false });
  expect(loadListed).toHaveBeenCalledWith(
    ["COMP1100", "COMP1110", "COMP2100"],
    2025,
  );
  expect(loadPage).not.toHaveBeenCalled();
});
