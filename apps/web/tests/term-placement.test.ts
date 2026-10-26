import { expect, test } from "vitest";
import type { Attempt, Course } from "@/lib/coursemap/types";
import {
  planPrerequisites,
  suggestedPlacement,
  termPlacements,
} from "@/lib/coursemap/term-placement";
import { rankCourses } from "@/ui/plan/plan-suggestions";
import { courses, terms } from "./fixtures/catalogue";

const catalogue = { courses, terms };
const course = (code: string) => {
  const found = courses.find((item) => item.code === code);
  if (!found) throw new Error(`The fixture has no ${code}.`);
  return found;
};
const attempt = (
  courseCode: string,
  termId: string,
  status: Attempt["status"] = "planned",
): Attempt => ({
  id: `${courseCode}-${termId}`,
  courseCode,
  termId,
  academicYear: 2026,
  status,
});
const placementTerms = terms.filter((term) => term.year <= 2027);

test("each term says whether the course runs there and whether its prerequisites come first", () => {
  const placements = termPlacements({
    course: course("COMP2100"),
    terms: placementTerms,
    attempts: [attempt("COMP1110", "2026-s2")],
    catalogue,
  });
  const byTerm = new Map(placements.map((item) => [item.term.id, item]));
  expect(byTerm.get("2026-s1")).toMatchObject({
    offered: true,
    prerequisites: "missing",
    missingCodes: ["COMP1110"],
  });
  expect(byTerm.get("2026-s2")?.offered).toBe(false);
  expect(byTerm.get("2027-s1")).toMatchObject({
    offered: true,
    prerequisites: "met",
    missingCodes: [],
  });
  expect(suggestedPlacement(placements)?.term.id).toBe("2027-s1");
});

test("a full semester is an overload, and the suggestion keeps a standard load first", () => {
  const full = ["COMP1100", "MATH1005", "COMP1600", "COMP2400"].map((code) =>
    attempt(code, "2027-s1"),
  );
  const placements = termPlacements({
    course: course("COMP2100"),
    terms: placementTerms,
    attempts: [attempt("COMP1110", "2026-s2"), ...full],
    catalogue,
  });
  const crowded = placements.find((item) => item.term.id === "2027-s1");
  expect(crowded).toMatchObject({
    currentUnits: 24,
    unitsAfter: 30,
    overload: true,
    needsPermission: false,
  });
  expect(suggestedPlacement(placements)?.term.id).toBe("2026-s1");
});

test("a course already planned is moved rather than counted twice", () => {
  const placements = termPlacements({
    course: course("COMP2100"),
    terms: placementTerms,
    attempts: [attempt("COMP2100", "2027-s1"), attempt("COMP1600", "2027-s1")],
    catalogue,
  });
  expect(placements.find((item) => item.term.id === "2027-s1")).toMatchObject({
    currentUnits: 6,
    unitsAfter: 12,
  });
});

test("a course's prerequisites read as missing until the plan covers them, and permission is called out", () => {
  expect(planPrerequisites(course("COMP2100"), [], catalogue)).toBe("missing");
  expect(
    planPrerequisites(
      course("COMP2100"),
      [attempt("COMP1110", "2027-s2")],
      catalogue,
    ),
  ).toBe("met");
  expect(planPrerequisites(course("MATH1005"), [], catalogue)).toBe("met");
  expect(
    planPrerequisites(
      { ...course("MATH1005"), permissionText: "Permission of the convener." },
      [],
      catalogue,
    ),
  ).toBe("permission");
});

test("suggestions put covered prerequisites first and leave out courses that clash with the plan", () => {
  const clashing: Course = {
    ...course("COMP2400"),
    code: "COMP2401",
    incompatibilities: ["Incompatible with COMP1100."],
  };
  const planCodes = new Set(["COMP1100", "COMP1110"]);
  const ranked = rankCourses(
    [course("COMP3430"), course("COMP2100"), clashing, course("COMP1100")],
    {
      planCodes,
      prerequisites: (item) =>
        planPrerequisites(
          item,
          [
            attempt("COMP1100", "2026-s1", "completed"),
            attempt("COMP1110", "2026-s2", "completed"),
          ],
          catalogue,
        ),
    },
  );
  expect(ranked.map((item) => item.code)).toEqual(["COMP2100", "COMP3430"]);
});

test("a course found by search is checked even when the plan's catalogue lacks it", () => {
  const found: Course = {
    ...course("MATH1005"),
    code: "ANTH1003",
    prerequisiteCodes: [],
    prerequisiteText: "No prerequisites listed.",
    prerequisiteRule: null,
  };
  expect(planPrerequisites(found, [], catalogue)).toBe("met");
});
