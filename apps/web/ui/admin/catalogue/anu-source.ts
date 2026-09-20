import type { CatalogueKind } from "@/lib/coursemap/catalogue-kinds";

const PROGRAMS_AND_COURSES = "https://programsandcourses.anu.edu.au";

/**
 * The ANU Programs and Courses page a record was imported from. The site names
 * its own segments, so "programme" and "specialisation" cannot be used
 * verbatim. Kept here because the directory, the record header and the review
 * all need to point a reader back at the source they are judging.
 */
export function anuSourceUrl({
  kind,
  code,
  academicYear,
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
}) {
  const segment =
    kind === "programme"
      ? "program"
      : kind === "specialisation"
        ? "specialisation"
        : kind;
  return `${PROGRAMS_AND_COURSES}/${academicYear}/${segment}/${code}`;
}
