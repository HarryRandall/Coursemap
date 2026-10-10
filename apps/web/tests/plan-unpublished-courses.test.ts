import { expect, test, vi } from "vitest";
import { loadCoursemapState } from "@/lib/coursemap/state";
import { planRisks } from "@/lib/coursemap/plan-risks";
import {
  degreeUnitProgress,
  effectiveStatus,
  evaluateCoursePrerequisites,
  statusLabel,
} from "@/lib/planner";
import type { Attempt } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

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

const catalogue = {
  courses: courses.map((course) => ({ ...course, year: 2026 })),
  terms,
};

function planned(courseCode: string, termId: string, extra = {}): Attempt {
  return {
    id: `${courseCode}-${termId}`,
    academicYear: 2026,
    courseCode,
    termId,
    status: "planned",
    ...extra,
  };
}

test("a planned course whose year is unpublished stays in the plan", async () => {
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
    plan_items: [
      {
        id: "published-item",
        catalogue_record_id: 5,
        planned_calendar_year: 2026,
        planned_period_code: "S1",
      },
      {
        id: "unpublished-item",
        catalogue_record_id: 6,
        planned_calendar_year: 2026,
        planned_period_code: "S2",
      },
      {
        id: "archived-item",
        catalogue_record_id: 7,
        planned_calendar_year: null,
        planned_period_code: null,
      },
    ],
    course_attempts: [],
    catalogue_codes: [
      { id: 1, code: "COMP1100" },
      { id: 2, code: "COMP1110" },
      { id: 3, code: "MATH1005" },
    ],
    catalogue_records: [
      {
        id: 5,
        code_id: 1,
        academic_year_id: 1,
        published_version_id: 50,
        archived_at: null,
      },
      {
        id: 6,
        code_id: 2,
        academic_year_id: 1,
        published_version_id: null,
        archived_at: null,
      },
      {
        id: 7,
        code_id: 3,
        academic_year_id: 1,
        published_version_id: 70,
        archived_at: "2026-03-01T00:00:00Z",
      },
    ],
  };
  const state = await loadCoursemapState({ id: "owner", email: null });
  expect(state.attempts).toEqual([
    {
      id: "published-item",
      academicYear: 2026,
      courseCode: "COMP1100",
      termId: "2026-s1",
      status: "planned",
    },
    {
      id: "unpublished-item",
      academicYear: 2026,
      courseCode: "COMP1110",
      termId: "2026-s2",
      status: "planned",
      isPublished: false,
    },
    {
      id: "archived-item",
      academicYear: 2026,
      courseCode: "MATH1005",
      termId: "unscheduled",
      status: "planned",
      isPublished: false,
    },
  ]);
});

test("an unpublished planned course needs review and satisfies nothing", () => {
  const unpublished = planned("COMP1100", "2026-s1", { isPublished: false });
  const dependent = planned("COMP1110", "2026-s2");
  const attempts = [unpublished, dependent];
  const withoutRecord = {
    ...catalogue,
    courses: catalogue.courses.filter((course) => course.code !== "COMP1100"),
  };

  expect(effectiveStatus(unpublished, attempts, withoutRecord)).toBe(
    "unpublished",
  );
  expect(statusLabel("unpublished")).toBe("No longer published");
  expect(effectiveStatus(dependent, attempts, withoutRecord)).toBe("blocked");
  expect(
    planRisks({
      buckets: [],
      attempts,
      catalogue: withoutRecord,
      progress: degreeUnitProgress(attempts, 0, withoutRecord),
    }),
  ).toContainEqual(
    expect.objectContaining({
      id: `attempt-${unpublished.id}`,
      title: "COMP1100",
      severity: "warning",
      detail: expect.stringMatching(/^No longer published/),
    }),
  );
});

test("a planned course missing from the catalogue is not counted as satisfied", () => {
  const missing = planned("ZZZZ1000", "2026-s1");
  expect(evaluateCoursePrerequisites(missing, [missing], catalogue).state).toBe(
    "unknown",
  );
  expect(effectiveStatus(missing, [missing], catalogue)).toBe("review");
});
