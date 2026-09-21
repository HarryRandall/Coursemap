import Link from "next/link";
import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { CatalogueIdentity } from "@/ui/admin/catalogue-table/catalogue-table";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import {
  DataTableShell,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/admin/catalogue-table/catalogue-table";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { cn } from "@/lib/cn";
import { Pagination } from "@/ui/common/pagination";
import { CourseAvailability } from "@/ui/courses/course-availability";
import { CourseRowActions } from "./course-row-actions";

const chipClasses =
  "rounded-md bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border ring-inset";

export function CourseDirectory({
  academicYear,
  courses,
  page,
  pageSize,
  total,
  filtered = false,
  searchParams,
}: {
  academicYear: number;
  courses: CourseDetails[];
  page: number;
  pageSize: number;
  total: number;
  filtered?: boolean;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <DataTableShell
      selectable={false}
      layout="public-courses"
      footer={
        <Pagination
          alwaysShowControls
          pathname="/courses"
          searchParams={searchParams}
          page={page}
          pageSize={pageSize}
          total={total}
          itemName="courses"
        />
      }
    >
      {courses.length === 0 ? (
        <CatalogueEmpty
          filtered={filtered}
          title={`No published courses for ${academicYear}`}
          description="Published courses will appear here when the catalogue is ready."
          clearHref={`/courses/${academicYear}`}
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">Published ANU courses</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Course</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Requisites</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((course) => {
              const href = `/courses/${academicYear}/${course.code.toLowerCase()}`;
              return (
                <LinkedTableRow key={course.code} className="group">
                  <TableCell>
                    <CatalogueIdentity
                      code={course.code}
                      title={course.name}
                      href={href}
                    />
                  </TableCell>
                  <TableCell>{academicYear}</TableCell>
                  <TableCell>
                    <div className="flex min-h-10 flex-wrap items-center gap-1">
                      {course.prerequisiteCodes.length === 0 ? (
                        <span className="text-[13px] text-muted-foreground/80">
                          None
                        </span>
                      ) : (
                        course.prerequisiteCodes.map((prerequisite) =>
                          course.availableCourseCodes.includes(prerequisite) ? (
                            <Link
                              key={prerequisite}
                              href={`/courses/${academicYear}/${prerequisite.toLowerCase()}`}
                              aria-label={`View prerequisite ${prerequisite}`}
                              className={cn(
                                chipClasses,
                                "font-mono transition-colors hover:bg-card hover:text-primary hover:ring-primary/25 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring motion-reduce:transition-none",
                              )}
                            >
                              {prerequisite}
                            </Link>
                          ) : (
                            <span
                              key={prerequisite}
                              className={cn(chipClasses, "font-mono")}
                              title={`${prerequisite} is not published for ${academicYear}`}
                            >
                              {prerequisite}
                            </span>
                          ),
                        )
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CourseAvailability
                      courseCode={course.code}
                      sessions={course.sessions}
                    />
                  </TableCell>
                  <TableCell>{course.units}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">
                      <CourseRowActions
                        course={{
                          code: course.code,
                          name: course.name,
                          sessions: course.sessions,
                          sourceUrl: course.sourceUrl,
                          year: academicYear,
                        }}
                      />
                    </div>
                  </TableCell>
                </LinkedTableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </DataTableShell>
  );
}
