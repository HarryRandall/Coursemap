import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CatalogueKind } from "@/lib/catalogue/content";
import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";
import { planCourseFromDetails } from "@/lib/coursemap/plan-catalogue";
import {
  loadPublishedCourse,
  loadPublishedCoursesByCodes,
} from "@/lib/coursemap/published-courses";
import { loadPublishedStructure } from "@/lib/coursemap/published-structures";
import {
  CATALOGUE_KIND_LABELS,
  publicCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";
import { loadCurrentUserRequisiteCompletion } from "@/lib/coursemap/requisite-progress";
import { CourseDetailClient } from "@/app/courses/[code]/course-detail-client";
import { StructureDetailClient } from "@/app/structures/[code]/structure-detail-client";
import { ErrorState } from "@/ui/common/error-state";
import { AppShell } from "@/ui/shell";

function PublicCatalogueError({
  kind,
  retryHref,
}: {
  kind: CatalogueKind;
  retryHref: string;
}) {
  const label = CATALOGUE_KIND_LABELS[kind].singular.toLowerCase();
  return (
    <AppShell>
      <ErrorState
        title={`${CATALOGUE_KIND_LABELS[kind].singular} temporarily unavailable`}
        description={`This ${label} could not be loaded. Please try again shortly.`}
      >
        <Button asChild>
          <Link href={retryHref}>Try again</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </ErrorState>
    </AppShell>
  );
}

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
      return <PublicCatalogueError kind={kind} retryHref={retryHref} />;
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
    return <PublicCatalogueError kind={kind} retryHref={retryHref} />;
  }
  if (!structure || structure.kind !== kind) notFound();
  let details;
  try {
    details = await loadPublishedCoursesByCodes(
      requirementCourseCodes(structure.requirements),
      academicYear,
    );
  } catch {
    return <PublicCatalogueError kind={kind} retryHref={retryHref} />;
  }
  return (
    <StructureDetailClient
      structure={structure}
      courses={details.map(planCourseFromDetails)}
    />
  );
}
