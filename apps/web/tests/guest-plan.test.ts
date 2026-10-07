import { expect, test } from "vitest";
import {
  GUEST_PLAN_COOKIE,
  decodeGuestPlan,
  emptyGuestState,
  encodeGuestPlan,
  guestPlanChunkName,
} from "@/lib/coursemap/guest-plan";
import type { AppState } from "@/lib/coursemap/types";

function cookieJar(chunks: string[]) {
  const jar = new Map(
    chunks.map((value, index) => [guestPlanChunkName(index), value]),
  );
  return (name: string) => jar.get(name);
}

const plan: AppState = {
  ...emptyGuestState(2026),
  profile: {
    ...emptyGuestState(2026).profile,
    name: "Ada Student",
    preferredName: "Ada",
    pronouns: "she/her",
    studentId: "u1234567",
    commencementYear: 2025,
    degreeCode: "BFINN",
    majorCode: "CAMA-MAJ",
    minorCodes: ["ECON-MIN"],
    enrolmentMode: "single_degree",
    extensionYears: 1,
  },
  attempts: [
    {
      id: "g1",
      courseCode: "FINM1001",
      termId: "2025-s1",
      academicYear: 2025,
      status: "completed",
      mark: 78,
      unitsAttempted: 6,
      unitsEarned: 6,
    },
    {
      id: "g2",
      courseCode: "ECON1101",
      termId: "unscheduled",
      academicYear: 2026,
      status: "planned",
    },
  ],
  placements: [
    { courseCode: "ECON1101", structureCode: "BFINN", requirementKey: "a/b" },
  ],
  starredCourses: ["STAT1008"],
};

test("a guest plan survives the trip through its cookie", () => {
  const chunks = encodeGuestPlan(plan);
  expect(chunks).toHaveLength(1);
  expect(decodeGuestPlan(cookieJar(chunks!))).toEqual(plan);
});

test("a long plan spreads over several cookies and reads back whole", () => {
  const long: AppState = {
    ...plan,
    attempts: Array.from({ length: 110 }, (_, index) => ({
      id: `g${index}`,
      courseCode: `COMP${1000 + index}`,
      termId: `${2025 + (index % 4)}-s${1 + (index % 2)}`,
      academicYear: 2026,
      status: "planned" as const,
    })),
  };
  const chunks = encodeGuestPlan(long)!;
  expect(chunks.length).toBeGreaterThan(1);
  chunks.forEach((chunk) => expect(chunk.length).toBeLessThan(4000));
  expect(decodeGuestPlan(cookieJar(chunks))?.attempts).toHaveLength(110);
  // A missing continuation is not read as a shorter plan.
  expect(decodeGuestPlan(cookieJar(chunks.slice(0, 1)))).toBeNull();
});

test("a plan too large for the browser's cookies is refused", () => {
  const oversized = {
    ...plan,
    placements: Array.from({ length: 40 }, (_, index) => ({
      courseCode: `CODE${index}`,
      structureCode: "BFINN",
      requirementKey: "k".repeat(200) + index,
    })),
    starredCourses: Array.from({ length: 40 }, (_, index) => `S${index}`),
    attempts: Array.from({ length: 120 }, (_, index) => ({
      id: `guest-attempt-${index}`.padEnd(32, "x"),
      courseCode: `COURSE${index}`.padEnd(32, "y"),
      termId: "2026-s1",
      academicYear: 2026,
      status: "planned" as const,
    })),
  };
  expect(encodeGuestPlan(oversized)).toBeNull();
});

test("a tampered cookie is rejected or cleaned, never trusted", () => {
  expect(decodeGuestPlan(() => "not a plan")).toBeNull();
  expect(decodeGuestPlan(() => "1.!!!")).toBeNull();

  const forged = btoa(
    JSON.stringify({
      v: 1,
      p: { n: "Eve", c: 1200, k: 2026, d: "<script>", x: 99, mi: [1, "OK"] },
      a: [
        ["g1", "COMP1100", "2026-s1", 2026, "p"],
        ["g1", "COMP1110", "2026-s1", 2026, "p"],
        ["g2", "DROP TABLE", "2026-s1", 2026, "p"],
        ["g3", "COMP2100", "next year", 2026, "p"],
        ["g4", "COMP2120", "2026-s2", 2026, "z"],
      ],
    }),
  ).replace(/=+$/u, "");
  const state = decodeGuestPlan((name) =>
    name === GUEST_PLAN_COOKIE ? `1.${forged}` : undefined,
  );
  expect(state?.profile.name).toBe("Eve");
  expect(state?.profile.degreeCode).toBe("");
  expect(state?.profile.commencementYear).toBe(new Date().getFullYear());
  expect(state?.profile.extensionYears).toBe(0);
  expect(state?.profile.minorCodes).toEqual(["OK"]);
  expect(state?.attempts.map((attempt) => attempt.courseCode)).toEqual([
    "COMP1100",
  ]);
});
