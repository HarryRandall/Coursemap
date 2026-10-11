import { describe, expect, it, test } from "vitest";
import { openCourseCount } from "@/ui/plan/plan-suggestions";
import {
  suggestionCondition as condition,
  suggestionGroup as group,
  suggestions,
} from "./fixtures/planner-suggestions";

test("counts remaining compulsory courses and names the last course", () => {
  const result = suggestions(
    [condition(1, ["COMP1100", "COMP1110", "MATH1005"])],
    new Map([
      ["COMP1100", "completed"],
      ["COMP1110", "planned"],
    ]),
  );
  expect(result.openCount).toBe(1);
  expect(result.rules[0].heading).toBe("Take MATH1005");
  expect(result.estimatedCount).toBe(false);
});

test("covered rules contribute no courses left to pick", () => {
  const result = suggestions(
    [condition(1, ["COMP1100"])],
    new Map([["COMP1100", "completed"]]),
  );
  expect(result.openCount).toBe(0);
  expect(result.rules[0].covered).toBe(true);
});

test("unit-only rules use remaining units and a labelled six-unit estimate", () => {
  const result = suggestions(
    [
      condition(1, ["COMP1100", "COMP1110", "MATH1005"], {
        minimumCourses: null,
        minimumUnits: 30,
      }),
    ],
    new Map(),
    [
      {
        key: "condition-1",
        state: "in_progress",
        targetUnits: 30,
        maximumUnits: null,
        targetCourses: null,
        completedUnits: 6,
        plannedUnits: 6,
        matchedCourseCodes: ["COMP1100", "COMP1110"],
      },
    ],
  );
  expect(result.openCount).toBe(3);
  expect(result.estimatedCount).toBe(true);
  expect(result.rules[0].heading).toBe("Pick 18 units");
});

test("a unit target requiring every fixed course shows only the remaining core count", () => {
  const result = suggestions(
    [
      condition(1, ["COMP1100", "COMP1110"], {
        minimumCourses: null,
        minimumUnits: 12,
      }),
    ],
    new Map([["COMP1100", "planned"]]),
  );
  expect(result.rules[0].compulsory).toBe(true);
  expect(result.rules[0].heading).toBe("Take COMP1110");
  expect(result.openCount).toBe(1);
  expect(result.estimatedCount).toBe(false);
});

test("any_of keeps compound alternatives together and counts the cheapest remaining option", () => {
  const result = suggestions([
    group(
      2,
      [
        group(3, [condition(1, ["COMP1100"]), condition(2, ["COMP1110"])]),
        condition(3, ["MATH1005"]),
      ],
      "any_of",
    ),
  ]);
  expect(result.rules).toHaveLength(1);
  expect(result.rules[0].heading).toBe("Pick one option");
  expect(result.rules[0].options).toHaveLength(2);
  expect(result.rules[0].options?.[0].options).toHaveLength(2);
  expect(result.openCount).toBe(1);
});

test("covering one alternative covers the whole decision", () => {
  const result = suggestions(
    [
      group(
        2,
        [condition(1, ["COMP1100"]), condition(2, ["COMP1110"])],
        "any_of",
      ),
    ],
    new Map([["COMP1100", "planned"]]),
  );
  expect(result.openCount).toBe(0);
  expect(result.rules[0].covered).toBe(true);
});

describe("openCourseCount", () => {
  const rule = (
    remainingCourses: number,
    catchAll = false,
    covered = false,
  ) => ({
    remainingCourses,
    catchAll,
    covered,
  });

  it("adds specific rules but lets a degree total overlap them", () => {
    expect(openCourseCount([rule(2), rule(4), rule(22, true)])).toBe(22);
    expect(openCourseCount([rule(5), rule(4), rule(3, true)])).toBe(9);
  });

  it("ignores covered rules", () => {
    expect(openCourseCount([rule(2, false, true), rule(0, true)])).toBe(0);
  });
});
