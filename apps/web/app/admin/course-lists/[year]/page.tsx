import { notFound } from "next/navigation";
import { ListTree, Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import {
  loadAdminCourseListsYear,
  loadCourseListYears,
} from "@/lib/admin/course-lists";
import { canWriteCatalogue } from "@/lib/auth/viewer";
import { courseListSuggestions } from "@/lib/catalogue/course-lists";
import { CopyCourseListsButton } from "@/ui/admin/course-lists/copy-course-lists-button";
import { CourseListCard } from "@/ui/admin/course-lists/course-list-card";
import { CourseListDialog } from "@/ui/admin/course-lists/course-list-dialog";
import { CourseListsToolbar } from "@/ui/admin/course-lists/course-lists-toolbar";
import { CourseListsWaiting } from "@/ui/admin/course-lists/course-lists-waiting";
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

  const [data, years, canEdit] = await Promise.all([
    loadAdminCourseListsYear(year).catch(() => null),
    loadCourseListYears().catch(() => [year]),
    canWriteCatalogue(),
  ]);
  const suggestions = data ? courseListSuggestions(data) : [];
  const copyable = data?.previous
    ? data.previous.lists.filter(
        (template) =>
          !data.lists.some(
            (list) => list.name.toLowerCase() === template.name.toLowerCase(),
          ),
      ).length
    : 0;

  return (
    <AppShell admin>
      <h1 className="sr-only">Course lists {year}</h1>
      <div className="flex flex-col gap-4">
        <CourseListsToolbar
          canEdit={canEdit}
          suggestions={suggestions}
          year={year}
          years={years}
        />
        {data === null ? (
          <ErrorState
            description="Refresh the page to try again."
            title={`Course lists for ${year} could not be loaded`}
            titleAs="h2"
          />
        ) : (
          <>
            <CourseListsWaiting
              canEdit={canEdit}
              suggestions={suggestions}
              waiting={data.waiting}
              year={year}
            />
            {data.lists.length === 0 ? (
              <Empty className="rounded-xl border bg-card py-12">
                <EmptyHeader className="max-w-md">
                  <EmptyMedia variant="icon">
                    <ListTree aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No course lists for {year}</EmptyTitle>
                  <EmptyDescription>
                    Some degrees require units from a list published elsewhere,
                    such as a college elective list. Importing that degree shows
                    the list above until it exists here.
                  </EmptyDescription>
                </EmptyHeader>
                {canEdit ? (
                  <EmptyContent>
                    <div className="flex flex-wrap justify-center gap-2">
                      {data.previous && copyable > 0 ? (
                        <CopyCourseListsButton
                          count={copyable}
                          fromYear={data.previous.year}
                          year={year}
                        />
                      ) : null}
                      <CourseListDialog
                        suggestions={suggestions}
                        trigger={
                          <Button type="button">
                            <Plus aria-hidden="true" size={15} />
                            New list
                          </Button>
                        }
                        year={year}
                      />
                    </div>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : (
              <>
                {canEdit && data.previous && copyable > 0 ? (
                  <div>
                    <CopyCourseListsButton
                      count={copyable}
                      fromYear={data.previous.year}
                      year={year}
                    />
                  </div>
                ) : null}
                <div className="grid gap-4 lg:grid-cols-2">
                  {data.lists.map((list) => (
                    <CourseListCard
                      canEdit={canEdit}
                      key={list.id}
                      list={list}
                      year={year}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
