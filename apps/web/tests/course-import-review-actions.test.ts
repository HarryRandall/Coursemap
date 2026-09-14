import { beforeEach, expect, test, vi } from "vitest";
import {
  acceptCourseImportTarget,
  rejectCourseImportTarget,
} from "@/lib/coursemap/course-import-review-actions";

const { rpc, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCourseImports: async () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));

const input = {
  runId: "12345678-1234-4234-8234-123456789abc",
  targetId: "12345678-1234-4234-8234-123456789def",
  expectedBaselineDraftSnapshotId: null,
  expectedCurrentDraftSnapshotId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
});

test.each([acceptCourseImportTarget, rejectCourseImportTarget])(
  "%s invalidates the year-specific course review after a decision",
  async (decide) => {
    expect((await decide(input)).ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/courses/[id]", "page");
  },
);

test("failed decisions do not invalidate the course review", async () => {
  rpc.mockResolvedValue({ error: { message: "stale" } });
  expect((await acceptCourseImportTarget(input)).ok).toBe(false);
  expect(revalidatePath).not.toHaveBeenCalled();
});
