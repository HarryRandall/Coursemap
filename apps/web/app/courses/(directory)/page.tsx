import { Button } from "@coursemap/ui/primitives/button";
import ReuiLink from "next/link";
import { AppShell } from "@/ui/shell";

import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { DataTableShell } from "@/ui/admin/catalogue-table/catalogue-table";
import { FilterBar } from "@/ui/common/filter-bar";
import {
  loadCourseDirectoryFilterOptions,
  loadPublishedCourseDirectoryPage,
  type CourseFilterOptions,
  type PublishedCoursePage,
} from "@/lib/coursemap/published-courses";
import { CourseDirectory } from "../course-directory";

type CoursesSearchParams = {
  q?: string | string[];
  subject?: string | string[];
  level?: string | string[];
  session?: string | string[];
  college?: string | string[];
  area?: string | string[];
  tag?: string | string[];
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
  // A digit is that level; a digit and + is that level or higher, which is
  // how degree rules ask for units ("2000-level or higher").
  const level = /^[1-9]\+?$/u.test(levelParam) ? levelParam : "";
  const sessionParam = firstParam(params.session);
  const session = ["Semester 1", "Semester 2"].includes(sessionParam)
    ? sessionParam
    : "";
  const subjectParam = firstParam(params.subject).toUpperCase();
  const subject = /^[A-Z]{4}$/u.test(subjectParam) ? subjectParam : "";
  const college = firstParam(params.college).slice(0, 120);
  const area = firstParam(params.area).slice(0, 120);
  const tag = firstParam(params.tag).slice(0, 120);
  const filters = { query, subject, level, session, college, area, tag };
  let filterOptions: CourseFilterOptions = {
    subjects: [],
    colleges: [],
    areas: [],
    tags: [],
  };
  let result: PublishedCoursePage = {
    courses: [],
    page,
    pageSize: 24,
    total: 0,
  };
  let catalogueUnavailable = false;
  try {
    [result, filterOptions] = await Promise.all([
      loadPublishedCourseDirectoryPage({ page, filters }),
      loadCourseDirectoryFilterOptions(),
    ]);
  } catch {
    // Show an explicit outage state rather than an empty catalogue.
    catalogueUnavailable = true;
  }
  const paginationSearchParams = {
    q: query || undefined,
    subject: subject || undefined,
    level: level || undefined,
    session: session || undefined,
    college: college || undefined,
    area: area || undefined,
    tag: tag || undefined,
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
              key: "subject",
              label: "Subject",
              options: filterOptions.subjects.map((option) => ({
                value: option.code,
                label: option.name
                  ? `${option.code} · ${option.name}`
                  : option.code,
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
                { value: "2+", label: "2000 level or higher" },
                { value: "3+", label: "3000 level or higher" },
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
            ...(
              [
                ["college", "College", filterOptions.colleges],
                ["area", "Area of interest", filterOptions.areas],
                ["tag", "Tag", filterOptions.tags],
              ] as const
            ).flatMap(([key, label, values]) =>
              // A filter with nothing to choose would only ever empty the list.
              values.length
                ? [
                    {
                      key,
                      label,
                      options: values.map((value) => ({ value, label: value })),
                    },
                  ]
                : [],
            ),
          ]}
        />
        <CourseDirectory
          courses={result.courses}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          filtered={Object.values(filters).some(Boolean)}
          searchParams={paginationSearchParams}
        />
      </div>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
