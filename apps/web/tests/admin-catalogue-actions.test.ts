import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  identity: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  discard: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({
    url: "http://127.0.0.1:54321",
    publishableKey: "test",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: "viewer-id", email: null } },
        error: null,
      }),
    },
    rpc: async (
      _name: string,
      { required_permission }: { required_permission: string },
    ) => ({ data: mocks.permissions.has(required_permission), error: null }),
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}));
vi.mock("@/lib/catalogue/drafts", () => {
  class CatalogueDraftError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    beginCatalogueDraft: vi.fn(),
    CatalogueDraftConflictError: class extends CatalogueDraftError {},
    CatalogueDraftError,
    discardCatalogueDraft: mocks.discard,
    loadCatalogueRecordIdentity: mocks.identity,
    publishCatalogueDraft: mocks.publish,
    restoreCatalogueVersion: vi.fn(),
    resolveDraftExtractionError: vi.fn(),
    saveCatalogueDraft: vi.fn(),
    unpublishCatalogueRecord: mocks.unpublish,
  };
});
vi.mock("@/lib/catalogue/source-review-decisions", () => ({
  markFieldForReview: vi.fn(),
  resolveSourceChange: vi.fn(),
}));

import {
  discardDraftAction,
  publishDraftAction,
  unpublishAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import { publishedCourseTag } from "@/lib/coursemap/published-cache";

const SESSION = "99000000-0000-4000-8000-000000000001";
const COURSE = { kind: "course", academicYear: 2026, code: "COMP1100" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = new Set();
  mocks.identity.mockResolvedValue(COURSE);
  mocks.publish.mockResolvedValue({ versionId: 1, record: COURSE });
  mocks.unpublish.mockResolvedValue({ versionId: 1, record: COURSE });
  mocks.discard.mockResolvedValue({ meaningful: false });
});

test("catalogue.write alone cannot publish, unpublish or discard a course", async () => {
  mocks.permissions = new Set(["catalogue.write"]);

  const results = await Promise.all([
    publishDraftAction({
      recordId: 1,
      expectedRevision: 1,
      editingSessionId: SESSION,
    }),
    unpublishAction({ recordId: 1, editingSessionId: SESSION }),
    discardDraftAction({
      recordId: 1,
      expectedRevision: 1,
      editingSessionId: SESSION,
      path: "/admin/courses/2026/comp1100",
    }),
  ]);

  for (const result of results) {
    expect(result).toEqual({
      ok: false,
      error: "Course write permission is required.",
    });
  }
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.unpublish).not.toHaveBeenCalled();
  expect(mocks.discard).not.toHaveBeenCalled();
});

test("catalogue.write still publishes academic structures", async () => {
  mocks.permissions = new Set(["catalogue.write"]);
  const major = { kind: "major", academicYear: 2026, code: "COMP-MAJ" };
  mocks.identity.mockResolvedValue(major);
  mocks.publish.mockResolvedValue({ versionId: 1, record: major });

  const result = await publishDraftAction({
    recordId: 2,
    expectedRevision: 1,
    editingSessionId: SESSION,
  });

  expect(result.ok).toBe(true);
  expect(mocks.publish).toHaveBeenCalledOnce();
});

test("publication invalidates the record the server published, whatever the browser sent", async () => {
  mocks.permissions = new Set(["courses.write"]);

  const result = await publishDraftAction({
    recordId: 1,
    expectedRevision: 1,
    editingSessionId: SESSION,
    // A stale or forged client could still send the old shape.
    ...({
      path: "/admin/courses/2026/math1013",
      record: { kind: "course", academicYear: 2025, code: "MATH1013" },
    } as object),
  });

  expect(result.ok).toBe(true);
  expect(mocks.updateTag).toHaveBeenCalledWith(
    publishedCourseTag(2026, "COMP1100"),
  );
  expect(mocks.updateTag).not.toHaveBeenCalledWith(
    publishedCourseTag(2025, "MATH1013"),
  );
  expect(mocks.revalidatePath).toHaveBeenCalledWith(
    "/admin/courses/2026/comp1100",
  );
  expect(mocks.revalidatePath).not.toHaveBeenCalledWith(
    "/admin/courses/2026/math1013",
  );
});

test("an unknown record is refused before any permission is assumed", async () => {
  mocks.permissions = new Set(["courses.write", "catalogue.write"]);
  mocks.identity.mockResolvedValue(null);

  const result = await unpublishAction({
    recordId: 404,
    editingSessionId: SESSION,
  });

  expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  expect(mocks.unpublish).not.toHaveBeenCalled();
});
