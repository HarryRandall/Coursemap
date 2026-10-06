import { expect, test, vi } from "vitest";

vi.mock("@/lib/coursemap/published-structures", () => ({
  loadPublishedStructure: vi.fn(),
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCourse: vi.fn(),
  loadPublishedCoursesByCodes: vi.fn(),
}));
vi.mock("@/lib/coursemap/plan-catalogue", () => ({
  planCourseFromDetails: vi.fn(),
}));
vi.mock("@/lib/coursemap/requisite-progress", () => ({
  loadCurrentUserRequisiteCompletion: vi.fn(),
}));
vi.mock("@/ui/courses/course-detail-client", () => ({
  CourseDetailClient: () => null,
}));
vi.mock("@/ui/requirements/structure-detail-client", () => ({
  StructureDetailClient: () => null,
}));
vi.mock("@/ui/catalogue/public-record-error", () => ({
  PublicRecordError: () => null,
}));

import { loadPublishedStructure } from "@/lib/coursemap/published-structures";
import { loadPublishedCoursesByCodes } from "@/lib/coursemap/published-courses";
import { PublicCatalogueRecordPage } from "@/ui/catalogue/public-record-page";

test("a public programme checks prose references against its own published course year", async () => {
  vi.mocked(loadPublishedStructure).mockResolvedValue({
    kind: "programme",
    requirements: null,
    introduction: "Consider MATH1014.",
    description: "Or MATH1116.",
    sections: [
      {
        markdown: "FINM2003 has been replaced by FINM3011. MATH1014 is useful.",
      },
    ],
  });
  vi.mocked(loadPublishedCoursesByCodes).mockResolvedValue([]);
  await PublicCatalogueRecordPage({
    kind: "programme",
    year: "2027",
    code: "bfinn",
  });
  expect(loadPublishedCoursesByCodes).toHaveBeenCalledExactlyOnceWith(
    ["MATH1014", "MATH1116", "FINM2003", "FINM3011"],
    2027,
  );
});
