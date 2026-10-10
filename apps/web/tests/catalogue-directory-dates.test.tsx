import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CatalogueDirectory } from "@/ui/admin/catalogue/catalogue-directory";
import type { CatalogueDirectoryPage } from "@/lib/coursemap/catalogue-kinds";
vi.mock("next/navigation", () => ({
  useRouter: () => ({}),
  usePathname: () => "/admin/courses/2026",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/ui/admin/catalogue/directory-row-actions", () => ({
  DirectoryRowActions: () => null,
}));
afterEach(() => vi.useRealTimers());
function page(completedAt: string): CatalogueDirectoryPage {
  return {
    kind: "course",
    academicYear: 2026,
    years: [2026],
    status: {
      state: "available",
      refreshedAt: null,
      message: null,
      entryCount: 1,
    },
    total: 1,
    page: 1,
    pageSize: 25,
    records: [
      {
        code: "COMP1100",
        title: "Course",
        summary: {},
        recordId: 1,
        hasDraft: false,
        hasChanges: false,
        draftRevision: null,
        isPublished: true,
        isListedByAnu: true,
        lastSeenAt: null,
        sourceState: "up_to_date",
        openChangeCount: 0,
        conflictCount: 0,
        latestSync: {
          id: "sync",
          status: "completed",
          errorMessage: null,
          completedAt,
        },
      },
    ],
  };
}
test("directory dates and hover timestamps use Canberra after DST starts", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T13:10:00Z"));
  render(
    <TooltipProvider>
      <CatalogueDirectory page={page("2026-10-04T13:05:00Z")} />
    </TooltipProvider>,
  );
  const cell = screen.getByRole("cell", { name: "5 Oct" });
  expect(cell).toHaveAttribute(
    "title",
    expect.stringMatching(/5 Oct 2026.*12:05 am/),
  );
});
test("year omission compares calendar years in Canberra", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T13:10:00Z"));
  render(
    <TooltipProvider>
      <CatalogueDirectory page={page("2026-12-31T13:05:00Z")} />
    </TooltipProvider>,
  );
  expect(screen.getByRole("cell", { name: "1 Jan" })).toBeInTheDocument();
});
