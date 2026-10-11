import { courseLevelBounds } from "@/lib/coursemap/course-level-filter";
import { withPlanningState } from "@/ui/plan/planning-page";
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
import {
  academicPeriodCode,
  STANDARD_ACADEMIC_PERIODS,
} from "@/lib/coursemap/academic-periods";
import { CourseDirectory } from "../course-directory";

type CoursesSearchParams = {
  codes?: string | string[];
  year?: string | string[];
  prerequisite?: string | string[];
  q?: string | string[];
  subject?: string | string[];
  level?: string | string[];
  session?: string | string[];
  units?: string | string[];
  mode?: string | string[];
  college?: string | string[];
  area?: string | string[];
  tag?: string | string[];
  page?: string | string[];
};

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<CoursesSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(firstParam(params.page)) || 1);
  const query = firstParam(params.q).slice(0, 100);
  const prerequisiteParam = firstParam(params.prerequisite).toUpperCase();
  const prerequisite = /^[A-Z]{4}\d{4}[A-Z]?$/u.test(prerequisiteParam)
    ? prerequisiteParam
    : "";
  const yearParam = firstParam(params.year);
  const academicYear = /^(202[0-9]|2030)$/u.test(yearParam)
    ? Number(yearParam)
    : prerequisite
      ? 2026
      : undefined;
  const levelParam = firstParam(params.level);
  const level = courseLevelBounds(levelParam) ? levelParam : "";
  const session = academicPeriodCode(firstParam(params.session)) ?? "";
  const unitsParam = firstParam(params.units);
  const units = /^\d{1,2}$/u.test(unitsParam) ? unitsParam : "";
  const mode = firstParam(params.mode).slice(0, 80);
  const subjectParam = firstParam(params.subject).toUpperCase();
  const subject = subjectParam
    .split(/[,\s]+/u)
    .every((code) => /^[A-Z]{4}$/u.test(code))
    ? subjectParam
    : "";
  const codes = firstParam(params.codes)
    .split(",")
    .filter((code) => /^[A-Z]{4}\d{4}[A-Z]?$/u.test(code))
    .join(",");
  const college = firstParam(params.college).slice(0, 120);
  const area = firstParam(params.area).slice(0, 120);
  const tag = firstParam(params.tag).slice(0, 120);
  const filters = {
    codes,
    query,
    subject,
    level,
    session,
    units,
    mode,
    college,
    area,
    tag,
    prerequisite,
  };
  let filterOptions: CourseFilterOptions = {
    subjects: [],
    years: [],
    units: [],
    modes: [],
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
      loadPublishedCourseDirectoryPage({ academicYear, page, filters }),
      loadCourseDirectoryFilterOptions(),
    ]);
  } catch {
    // Show an explicit outage state rather than an empty catalogue.
    catalogueUnavailable = true;
  }
  const paginationSearchParams = {
    codes: codes || undefined,
    year: academicYear === undefined ? undefined : String(academicYear),
    prerequisite: prerequisite || undefined,
    q: query || undefined,
    subject: subject || undefined,
    level: level || undefined,
    session: session || undefined,
    units: units || undefined,
    mode: mode || undefined,
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
        {prerequisite ? (
          <p className="text-sm text-muted-foreground">
            Courses listing {prerequisite} as a prerequisite in {academicYear}
          </p>
        ) : null}
        <FilterBar
          searchPlaceholder="Search by course code, name or school"
          filters={[
            ...(prerequisite
              ? [
                  {
                    key: "prerequisite",
                    label: "Prerequisite",
                    options: [{ value: prerequisite, label: prerequisite }],
                  },
                ]
              : []),
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
              options: [...STANDARD_ACADEMIC_PERIODS]
                .sort((left, right) => left.sortOrder - right.sortOrder)
                .map((period) => ({ value: period.code, label: period.name })),
            },
            ...(filterOptions.units.length > 1
              ? [
                  {
                    key: "units",
                    label: "Units",
                    options: filterOptions.units.map((value) => ({
                      value: String(value),
                      label: `${value} units`,
                    })),
                  },
                ]
              : []),
            ...(filterOptions.modes.length > 1
              ? [
                  {
                    key: "mode",
                    label: "Delivery mode",
                    options: filterOptions.modes.map((value) => ({
                      value,
                      label: value,
                    })),
                  },
                ]
              : []),
            ...(filterOptions.years.length > 1
              ? [
                  {
                    key: "year",
                    label: "Catalogue year",
                    allLabel: "Latest year",
                    options: filterOptions.years.map((value) => ({
                      value: String(value),
                      label: String(value),
                    })),
                  },
                ]
              : []),
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
          showRequisites={Boolean(prerequisite)}
        />
      </div>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";

export default withPlanningState(CoursesPage);
