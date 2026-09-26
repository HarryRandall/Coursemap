import { Button } from "@coursemap/ui/primitives/button";
import ReuiLink from "next/link";
import { AppShell } from "@/ui/shell";

import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { DataTableShell } from "@/ui/admin/catalogue-table/catalogue-table";
import { FilterBar } from "@/ui/common/filter-bar";
import {
  loadAcademicYearOptions,
  loadPublishedCoursePage,
  type PublishedCoursePage,
} from "@/lib/coursemap/published-courses";
import { CourseDirectory } from "../course-directory";

type CoursesSearchParams = {
  q?: string | string[];
  level?: string | string[];
  session?: string | string[];
  year?: string | string[];
  page?: string | string[];
};

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<CoursesSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(firstParam(params.page)) || 1);
  const query = firstParam(params.q).slice(0, 100);
  const levelParam = firstParam(params.level);
  const level = ["1", "2", "3", "4"].includes(levelParam) ? levelParam : "";
  const sessionParam = firstParam(params.session);
  const session = ["Semester 1", "Semester 2"].includes(sessionParam)
    ? sessionParam
    : "";
  const filters = { query, level, session };
  let yearOptions: Awaited<ReturnType<typeof loadAcademicYearOptions>> = [];
  let selectedAcademicYear = new Date().getFullYear();
  let result: PublishedCoursePage = {
    courses: [],
    page,
    pageSize: 24,
    total: 0,
  };
  let catalogueUnavailable = false;
  try {
    yearOptions = await loadAcademicYearOptions();
    const requestedYear = Number(firstParam(params.year));
    const availableYears = new Set(yearOptions.map((option) => option.year));
    const currentYear = new Date().getFullYear();
    selectedAcademicYear = availableYears.has(requestedYear)
      ? requestedYear
      : availableYears.has(currentYear)
        ? currentYear
        : (yearOptions[0]?.year ?? currentYear);
    result = await loadPublishedCoursePage({
      academicYear: selectedAcademicYear,
      page,
      filters,
    });
  } catch {
    // Show an explicit outage state rather than an empty catalogue.
    catalogueUnavailable = true;
  }
  const paginationSearchParams = {
    q: query || undefined,
    level: level || undefined,
    session: session || undefined,
    year: String(selectedAcademicYear),
  };

  if (catalogueUnavailable) {
    const retryQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(paginationSearchParams)) {
      if (value) retryQuery.set(key, value);
    }
    if (page > 1) retryQuery.set("page", String(page));
    const retryHref = retryQuery.size
      ? `/courses?${retryQuery.toString()}`
      : "/courses";
    return (
      <AppShell fill>
        <h1 className="sr-only">Explore courses</h1>
        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
          <DataTableShell selectable={false}>
            <CatalogueEmpty
              error
              title="Course catalogue temporarily unavailable"
              description="Courses could not be loaded. Please try again shortly."
            >
              <Button asChild variant="default">
                <ReuiLink href={retryHref}>Try again</ReuiLink>
              </Button>
              <Button asChild variant="outline">
                <ReuiLink href="/dashboard">Back to home</ReuiLink>
              </Button>
            </CatalogueEmpty>
          </DataTableShell>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fill>
      <h1 className="sr-only">Explore courses</h1>
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-5">
        <FilterBar
          searchPlaceholder="Search by course code, name or school"
          filters={[
            {
              key: "year",
              label: "Academic year",
              allLabel: "Current academic year",
              options: yearOptions.map((option) => ({
                value: String(option.year),
                label: option.hasPublishedCourses
                  ? String(option.year)
                  : `${option.year} · No published courses`,
              })),
            },
            {
              key: "level",
              label: "Level",
              options: [
                { value: "1", label: "1000 level" },
                { value: "2", label: "2000 level" },
                { value: "3", label: "3000 level" },
                { value: "4", label: "4000 level" },
              ],
            },
            {
              key: "session",
              label: "Teaching period",
              options: [
                { value: "Semester 1", label: "Semester 1" },
                { value: "Semester 2", label: "Semester 2" },
              ],
            },
          ]}
        />
        <CourseDirectory
          courses={result.courses}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          filtered={Boolean(query || level || session)}
          academicYear={selectedAcademicYear}
          searchParams={paginationSearchParams}
        />
      </div>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
