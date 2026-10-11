import { describe, expect, test } from "vitest";
import {
  effectiveStatus,
  evaluateCoursePrerequisites,
  evaluateCourseIncompatibilities,
} from "../lib/planner.ts";
import {
  emptyGuestState,
  encodeGuestPlan,
  decodeGuestPlan,
  guestPlanChunkName,
} from "../lib/coursemap/guest-plan.ts";
import {
  validPlanOverride,
  validCreditedUnits,
} from "../lib/coursemap/plan-overrides.ts";

const first = {
  id: "first",
  courseCode: "COMP2000",
  termId: "2026-s1",
  status: "planned",
};
const downstream = {
  id: "next",
  courseCode: "COMP3000",
  termId: "2026-s2",
  status: "planned",
};
const catalogue = {
  courses: [
    {
      code: "COMP2000",
      year: 2026,
      prerequisiteCodes: ["COMP1000"],
      permissionText: "Approval required",
    },
    { code: "COMP3000", year: 2026, prerequisiteCodes: ["COMP2000"] },
  ],
  terms: [
    { id: "2026-s1", sortOrder: 1 },
    { id: "2026-s2", sortOrder: 2 },
  ],
};
const override = {
  courseCode: "COMP2000",
  reason: "approval",
  note: "School approval",
};

describe("course overrides", () => {
  test("bypass clears the block and permission, and removal restores it", () => {
    expect(effectiveStatus(first, [first], catalogue)).toBe("blocked");
    const bypassed = { ...catalogue, courseOverrides: [override] };
    expect(effectiveStatus(first, [first], bypassed)).toBe("planned");
    expect(evaluateCoursePrerequisites(first, [first], bypassed).state).toBe(
      "satisfied",
    );
    expect(
      evaluateCourseIncompatibilities(first, [first], bypassed).state,
    ).toBe("satisfied");
    expect(
      effectiveStatus(first, [first], { ...bypassed, courseOverrides: [] }),
    ).toBe("blocked");
  });
  test("downstream sees the bypassed course only in an earlier period", () => {
    const bypassed = { ...catalogue, courseOverrides: [override] };
    expect(effectiveStatus(downstream, [first, downstream], bypassed)).toBe(
      "planned",
    );
    expect(
      effectiveStatus(
        { ...downstream, termId: first.termId },
        [first, downstream],
        bypassed,
      ),
    ).toBe("blocked");
  });
  test("does not change recorded results or hide unpublished courses", () => {
    const bypassed = { ...catalogue, courseOverrides: [override] };
    expect(
      effectiveStatus({ ...first, status: "failed" }, [first], bypassed),
    ).toBe("failed");
    expect(
      effectiveStatus({ ...first, isPublished: false }, [first], bypassed),
    ).toBe("unpublished");
  });
});

test("guest cookies round trip both overrides and accept legacy plans", () => {
  const state = {
    ...emptyGuestState(2026),
    courseOverrides: [override],
    requirementOverrides: [
      {
        structureCode: "TEST",
        requirementKey: "electives",
        reason: "credit",
        creditedUnits: 6,
        note: "Exemption",
      },
    ],
  };
  const roundTrip = (value) => {
    const chunks = encodeGuestPlan(value);
    return decodeGuestPlan(
      (name) =>
        chunks[
          chunks.findIndex((_, index) => guestPlanChunkName(index) === name)
        ],
    );
  };
  expect(roundTrip(state).courseOverrides).toEqual(state.courseOverrides);
  expect(roundTrip(state).requirementOverrides).toEqual(
    state.requirementOverrides,
  );
  expect(roundTrip(emptyGuestState(2026)).courseOverrides).toEqual([]);
  expect(
    roundTrip({ ...state, courseOverrides: [], requirementOverrides: [] })
      .requirementOverrides,
  ).toEqual([]);
});

test("override input rejects invalid reasons, long notes and fractional units", () => {
  expect(validPlanOverride({ reason: "other", note: "x".repeat(500) })).toBe(
    true,
  );
  expect(validPlanOverride({ reason: "other", note: "x".repeat(501) })).toBe(
    false,
  );
  expect(validPlanOverride({ reason: "toString" })).toBe(false);
  expect(validCreditedUnits(1.5)).toBe(false);
  expect(validCreditedUnits(-1)).toBe(false);
  expect(validCreditedUnits(0)).toBe(true);
});

test("explicit requirement credit contributes to degree totals without scheduling courses", async () => {
  const { degreeUnitProgress } = await import("../lib/planner.ts");
  expect(
    degreeUnitProgress([], 24, { ...catalogue, creditedRequirementUnits: 6 }),
  ).toMatchObject({ completed: 6, planned: 0, mapped: 6, remaining: 18 });
  expect(degreeUnitProgress([], 24, catalogue)).toMatchObject({
    completed: 0,
    mapped: 0,
    remaining: 24,
  });
});

test("bypass also clears an evaluated incompatibility and undo restores it", () => {
  const target = { ...first, courseCode: "COMP3000", termId: "2026-s2" };
  const other = {
    ...first,
    id: "other",
    courseCode: "COMP1000",
    termId: "2026-s2",
  };
  const incompatible = {
    ...catalogue,
    courses: [
      {
        code: "COMP3000",
        year: 2026,
        prerequisiteCodes: [],
        incompatibilityRule: {
          hardness: "hard",
          reviewState: "verified",
          relationalExpression: {
            kind: "incompatible_concurrent",
            code: "COMP1000",
            hardness: "hard",
            reviewState: "verified",
            confidence: 1,
            sourceText: "Cannot enrol concurrently.",
          },
        },
      },
    ],
  };
  expect(effectiveStatus(target, [target, other], incompatible)).toBe(
    "blocked",
  );
  expect(
    effectiveStatus(target, [target, other], {
      ...incompatible,
      courseOverrides: [{ courseCode: "COMP3000", reason: "other" }],
    }),
  ).toBe("planned");
  expect(
    effectiveStatus(target, [target, other], {
      ...incompatible,
      courseOverrides: [],
    }),
  ).toBe("blocked");
});
