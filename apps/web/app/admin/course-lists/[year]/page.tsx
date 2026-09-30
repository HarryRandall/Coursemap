import { notFound } from "next/navigation";
import { Card } from "@coursemap/ui/primitives/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import {
  loadAdminCourseLists,
  loadCourseListYears,
} from "@/lib/admin/course-lists";
import { canWriteCatalogue } from "@/lib/auth/viewer";
import { CourseListCard } from "@/ui/admin/course-lists/course-list-card";
import { CourseListsToolbar } from "@/ui/admin/course-lists/course-lists-toolbar";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

export const dynamic = "force-dynamic";

export default async function AdminCourseListsPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const raw = (await params).year;
  const year = /^\d{4}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(year)) notFound();

  const [lists, years, canEdit] = await Promise.all([
    loadAdminCourseLists(year).catch(() => null),
    loadCourseListYears().catch(() => [year]),
    canWriteCatalogue(),
  ]);

  return (
    <AppShell admin>
      <h1 className="sr-only">Course lists {year}</h1>
      <div className="flex flex-col gap-4">
        <CourseListsToolbar canEdit={canEdit} year={year} years={years} />
        {lists === null ? (
          <ErrorState
            description="Refresh the page to try again."
            title={`Course lists for ${year} could not be loaded`}
            titleAs="h2"
          />
        ) : lists.length === 0 ? (
          <Card>
            <Empty className="py-12">
              <EmptyHeader className="max-w-md">
                <EmptyTitle>No course lists for {year}</EmptyTitle>
                <EmptyDescription>
                  Add a list when a degree requires units from a named list of
                  courses.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {lists.map((list) => (
              <CourseListCard
                canEdit={canEdit}
                key={list.id}
                list={list}
                year={year}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
