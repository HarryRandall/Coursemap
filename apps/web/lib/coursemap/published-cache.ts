import { updateTag } from "next/cache";
import type { CatalogueKind } from "@/lib/catalogue/content";

/**
 * Cache tags for the published reads. The loaders and the invalidation both
 * build them here, because a tag that only one side knows about is a public
 * page that never notices it was republished.
 */
export const PUBLISHED_COURSE_DETAIL_TAG = "published-course-detail";
export const PUBLISHED_COURSE_PAGE_TAG = "published-course-page";
export const PUBLISHED_COURSE_YEARS_TAG = "published-course-years";
export const PUBLISHED_STRUCTURE_DETAIL_TAG = "published-structure-detail";

export function publishedCourseYearTag(academicYear: number) {
  return `published-courses:${academicYear}`;
}

export function publishedCourseTag(academicYear: number, code: string) {
  return `published-course:${academicYear}:${code.trim().toUpperCase()}`;
}

export function publishedStructureTag(academicYear: number, code: string) {
  return `published-structure:${academicYear}:${code.trim().toUpperCase()}`;
}

/** Every tag a change to one record's publication state invalidates. */
export function publishedRecordTags({
  kind,
  academicYear,
  code,
}: {
  kind: CatalogueKind;
  academicYear: number;
  code: string;
}) {
  if (kind !== "course") {
    return [
      PUBLISHED_STRUCTURE_DETAIL_TAG,
      publishedStructureTag(academicYear, code),
    ];
  }
  return [
    PUBLISHED_COURSE_DETAIL_TAG,
    PUBLISHED_COURSE_PAGE_TAG,
    PUBLISHED_COURSE_YEARS_TAG,
    publishedCourseTag(academicYear, code),
    publishedCourseYearTag(academicYear),
  ];
}

/**
 * Drops the cached public reads for one record. `updateTag` rather than
 * `revalidateTag` because publication happens in a server action and the
 * administrator should be able to open the public page and see the version
 * they just published, not the one that was cached five minutes ago.
 */
export function revalidatePublishedRecord(record: {
  kind: CatalogueKind;
  academicYear: number;
  code: string;
}) {
  for (const tag of publishedRecordTags(record)) updateTag(tag);
}
