import { beforeEach, expect, test, vi } from "vitest";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { loadPublishedUniversityCalendar } from "@/lib/coursemap/university-calendar-data";
import { revalidatePublishedRecord } from "@/lib/coursemap/published-cache";
import { saveKeyDateAction } from "@/lib/admin/key-dates-actions";
const mocks = vi.hoisted(() => ({
  cache: new Map<string, { value: unknown; tags: string[] }>(),
  reads: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  title: "Semester begins",
}));
vi.mock("next/cache", () => ({
  unstable_cache:
    (
      fn: (...args: unknown[]) => Promise<unknown>,
      keys: string[],
      options: { tags: string[] },
    ) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (!mocks.cache.has(key))
        mocks.cache.set(key, { value: await fn(...args), tags: options.tags });
      return mocks.cache.get(key)?.value;
    },
  updateTag: (tag: string) => {
    mocks.update(tag);
    for (const [key, entry] of mocks.cache)
      if (entry.tags.includes(tag)) mocks.cache.delete(key);
  },
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: async () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      let columns = "";
      const query = {
        select: (value: string) => {
          columns = value;
          return query;
        },
        eq: () => query,
        neq: () => query,
        is: () => query,
        not: () => query,
        order: () => query,
        range: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          mocks.reads(table, columns);
          return Promise.resolve({
            data:
              table === "catalogue_records"
                ? []
                : columns === "calendar_year"
                  ? [{ calendar_year: 2026 }]
                  : [{ id: 1, event_date: "2026-02-23", title: mocks.title }],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.clear();
  mocks.title = "Semester begins";
  mocks.rpc.mockResolvedValue({ error: null });
});
test("published onboarding choices are reused and expired on structure publication", async () => {
  await loadOnboardingCatalogue();
  await loadOnboardingCatalogue();
  expect(mocks.reads).toHaveBeenCalledTimes(1);
  revalidatePublishedRecord({
    kind: "programme",
    academicYear: 2026,
    code: "BCOMP",
  });
  await loadOnboardingCatalogue();
  expect(mocks.reads).toHaveBeenCalledTimes(2);
});
test("calendar publication expires the cached dates and available years", async () => {
  await loadPublishedUniversityCalendar(2026);
  await loadPublishedUniversityCalendar(2026);
  expect(mocks.reads).toHaveBeenCalledTimes(2);
  mocks.title = "Changed date";
  expect(
    (await saveKeyDateAction(2026, { date: "2026-02-23", title: mocks.title }))
      .ok,
  ).toBe(true);
  expect((await loadPublishedUniversityCalendar(2026)).events[0].title).toBe(
    "Changed date",
  );
  expect(mocks.update).toHaveBeenCalledWith("published-university-calendar");
});
