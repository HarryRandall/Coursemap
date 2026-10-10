import { expect, test, vi } from "vitest";
import { adminUserStudyProgress } from "@/lib/admin/user-study";
import { loadAdminUserDetail } from "@/lib/admin/users";

const database = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
}));
vi.mock("@/lib/auth/viewer", () => ({
  canReadStudentRecords: async () => true,
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

test("a planned course whose year is unpublished or archived adds no units for admins", async () => {
  database.rows = {
    admin_users: [
      {
        user_id: "student",
        email: null,
        display_name: "Student",
        student_number: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      },
    ],
    plans: [
      {
        id: "plan",
        academic_year_id: 1,
        name: "Plan",
        status: "active",
        commencement_year: 2026,
        study_load: "full_time",
        extension_years: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    academic_years: [{ id: 1, year: 2026 }],
    plan_items: [5, 6, 7].map((recordId) => ({
      id: `item-${recordId}`,
      catalogue_record_id: recordId,
      academic_period_id: null,
      planned_calendar_year: 2026,
      planned_period_code: "S1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      sort_order: recordId,
    })),
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
    catalogue_codes: [
      { id: 1, code: "COMP1100" },
      { id: 2, code: "COMP1110" },
      { id: 3, code: "MATH1005" },
    ],
    course_version_details: [50, 70].map((versionId) => ({
      version_id: versionId,
      title: `Course ${versionId}`,
      units: 6,
      minimum_units: null,
      maximum_units: null,
    })),
  };
  const detail = await loadAdminUserDetail("student");
  const courses = detail!.study.courses;
  expect(
    courses.map(({ code, title, units }) => ({ code, title, units })),
  ).toEqual([
    { code: "COMP1100", title: "Course 50", units: 6 },
    { code: "COMP1110", title: "No longer published", units: 0 },
    { code: "MATH1005", title: "No longer published", units: 0 },
  ]);
  expect(adminUserStudyProgress(detail!.study).mapped).toBe(6);
});
