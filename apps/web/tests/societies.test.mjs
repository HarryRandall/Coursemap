import { expect, test } from "vitest";
import { filterSocieties } from "@/lib/societies";
import { EXAMPLE_SOCIETIES } from "@/tests/fixtures/societies";

test("students can find a society by its short name or a combination of interests", () => {
  expect(
    filterSocieties(EXAMPLE_SOCIETIES, "  CSSA  ", "").map(
      (society) => society.slug,
    ),
  ).toEqual(["computer-science-students-association"]);
  expect(
    filterSocieties(EXAMPLE_SOCIETIES, "games anime", "").map(
      (society) => society.slug,
    ),
  ).toEqual(["anime-and-gaming-society"]);
});

test("category and search narrow the directory together without discarding the examples", () => {
  expect(filterSocieties(EXAMPLE_SOCIETIES, "", "Academic")).toHaveLength(3);
  expect(filterSocieties(EXAMPLE_SOCIETIES, "gaming", "Academic")).toEqual([]);
  expect(filterSocieties(EXAMPLE_SOCIETIES, "", "")).toHaveLength(10);
});
