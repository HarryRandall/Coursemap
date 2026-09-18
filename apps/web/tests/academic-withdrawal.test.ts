import { expect, test, vi } from "vitest";
import { loadCoursemapState } from "@/lib/coursemap/state";
import {
  degreeUnitProgress,
  evaluateCoursePrerequisites,
  termLoad,
  unitsByCalendarYear,
} from "@/lib/planner";
import {
  dashboardCalendarEvents,
  dashboardTermLoads,
} from "@/lib/coursemap/dashboard-series";
import { requirementCourseStatus } from "@/lib/coursemap/requirement-display";
import { courses, terms } from "./fixtures/catalogue";
import type { Attempt } from "@/lib/coursemap/types";

const database = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const result = { data: database.rows[table] ?? [], error: null };
      const promise = Promise.resolve(result);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        in: () => query,
        maybeSingle: async () => ({ ...result, data: result.data[0] ?? null }),
        then: promise.then.bind(promise),
      };
      return query;
    },
  }),
}));

for (const grade of ["WD", "WL"]) {
  test(`${grade} stays in academic history without contributing to a plan`, async () => {
    database.rows = {
      profiles: [],
      plans: [
        {
          id: "plan",
          academic_year_id: 1,
          commencement_year: 2026,
          study_load: "full_time",
          extension_years: 0,
        },
      ],
      academic_years: [{ id: 1, year: 2026 }],
      plan_structures: [],
      plan_items: [],
      course_attempts: [
        {
          id: "withdrawal",
          course_id: 1,
          course_snapshot_id: 10,
          academic_period_id: 1,
          status: "withdrawn",
          grade,
          mark: null,
          units_attempted: 6,
          units_earned: 0,
        },
      ],
      catalogue_items: [{ id: 1, code: "COMP1100" }],
      academic_periods: [{ id: 1, calendar_year: 2026, code: "S1" }],
      catalogue_snapshots: [{ id: 10, academic_year_id: 1 }],
    };
    const state = await loadCoursemapState({ id: "owner", email: null });
    expect(state.attempts).toEqual([
      expect.objectContaining({
        id: "withdrawal",
        status: "withdrawn",
        resultCode: grade,
        unitsAttempted: 6,
        unitsEarned: 0,
      }),
    ]);
    const catalogue = {
      courses: courses.map((course) => ({
        ...course,
        year: 2026,
        snapshotId: course.code === "COMP1100" ? 10 : undefined,
      })),
      terms,
    };
    const next: Attempt = {
      id: "next",
      courseCode: "COMP1110",
      academicYear: 2026,
      termId: "2026-s2",
      status: "planned",
    };
    expect(
      evaluateCoursePrerequisites(next, [...state.attempts, next], catalogue),
    ).toMatchObject({ state: "unsatisfied", missingCodes: ["COMP1100"] });
    expect(degreeUnitProgress(state.attempts, 144, catalogue)).toMatchObject({
      completed: 0,
      planned: 0,
      remaining: 144,
    });
    expect(termLoad(state.attempts, "2026-s1", undefined, catalogue)).toEqual({
      courses: 0,
      units: 0,
    });
    expect(
      unitsByCalendarYear(state.attempts, catalogue).find(
        (year) => year.year === 2026,
      ),
    ).toMatchObject({ completed: 0, planned: 0, total: 0 });
    expect(requirementCourseStatus("COMP1100", state.attempts)).toBeNull();
    expect(
      dashboardTermLoads({ ...catalogue, attempts: state.attempts }).every(
        (term) => term.units === 0,
      ),
    ).toBe(true);
    expect(
      dashboardCalendarEvents({ ...catalogue, attempts: state.attempts }),
    ).toEqual([]);
  });
}
