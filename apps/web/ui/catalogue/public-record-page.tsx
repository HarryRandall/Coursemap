import { notFound, redirect } from "next/navigation";
import type { CatalogueKind } from "@/lib/catalogue/content";
import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";
import { planCourseFromDetails } from "@/lib/coursemap/plan-catalogue";
import {
  loadPublishedCourse,
  loadPublishedCoursesByCodes,
} from "@/lib/coursemap/published-courses";
import { loadPublishedStructure } from "@/lib/coursemap/published-structures";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { loadCurrentUserRequisiteCompletion } from "@/lib/coursemap/requisite-progress";
import { CourseDetailClient } from "@/ui/courses/course-detail-client";
import { StructureDetailClient } from "@/ui/requirements/structure-detail-client";
import { PublicRecordError } from "./public-record-error";

export async function PublicCatalogueRecordPage({
  kind,
  year,
  code,
}: {
  kind: CatalogueKind;
  year: string;
  code: string;
}) {
  const academicYear = Number(year);
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  )
    notFound();
  if (code !== code.toLowerCase())
    redirect(publicCatalogueRecordPath(kind, academicYear, code));
  const retryHref = publicCatalogueRecordPath(kind, academicYear, code);
  if (kind === "course") {
    let course;
    let requisiteCompletion;
    try {
      [course, requisiteCompletion] = await Promise.all([
        loadPublishedCourse(code, academicYear),
        loadCurrentUserRequisiteCompletion(),
      ]);
    } catch {
      return <PublicRecordError kind={kind} retryHref={retryHref} />;
    }
    if (!course) notFound();
    return (
      <CourseDetailClient
        course={course}
        requisiteCompletion={requisiteCompletion}
      />
    );
  }
  let structure;
  try {
    structure = await loadPublishedStructure(code, academicYear);
  } catch {
    return <PublicRecordError kind={kind} retryHref={retryHref} />;
  }
  if (!structure || structure.kind !== kind) notFound();
  let details;
  try {
    details = await loadPublishedCoursesByCodes(
      requirementCourseCodes(structure.requirements),
      academicYear,
    );
  } catch {
    return <PublicRecordError kind={kind} retryHref={retryHref} />;
  }
  return (
    <StructureDetailClient
      structure={structure}
      courses={details.map(planCourseFromDetails)}
    />
  );
}
