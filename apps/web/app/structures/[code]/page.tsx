import { notFound } from "next/navigation";

import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";
import { planCourseFromDetails } from "@/lib/coursemap/plan-catalogue";
import { loadPublishedCoursesByCodes } from "@/lib/coursemap/published-courses";
import {
  loadPublishedStructure,
  loadPublishedStructureYears,
} from "@/lib/coursemap/published-structures";
import type { Course } from "@/lib/coursemap/types";
import { StructureCatalogueError } from "@/ui/requirements/structure-catalogue-error";
import { StructureDetailClient } from "./structure-detail-client";

export default async function StructurePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const { code } = await params;
  const requestedYearParam = (await searchParams).year;
  const requestedYear = Number(
    Array.isArray(requestedYearParam)
      ? requestedYearParam[0]
      : requestedYearParam,
  );

  let structure = null;
  let courses: Course[] = [];
  try {
    const years = await loadPublishedStructureYears(code);
    if (years.length === 0) notFound();
    const thisYear = new Date().getFullYear();
    const academicYear = years.includes(requestedYear)
      ? requestedYear
      : years.includes(thisYear)
        ? thisYear
        : years[0];
    structure = await loadPublishedStructure(code, academicYear);
    if (structure) {
      // The option cards read better with a title and a unit value, so the
      // courses the tree names are resolved once here rather than per card.
      const details = await loadPublishedCoursesByCodes(
        requirementCourseCodes(structure.requirements),
        academicYear,
      );
      courses = details.map(planCourseFromDetails);
    }
  } catch {
    return (
      <StructureCatalogueError
        retryHref={`/structures/${encodeURIComponent(code)}`}
      />
    );
  }

  if (!structure) notFound();
  return <StructureDetailClient structure={structure} courses={courses} />;
}

export const dynamic = "force-dynamic";
