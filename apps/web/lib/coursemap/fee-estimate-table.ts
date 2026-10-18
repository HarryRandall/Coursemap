import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public-server";
import {
  buildFeeEstimateTable,
  courseFeeEstimates,
  feePerUnit,
  type FeeAudience,
  type FeeEstimateTable,
  type FeeReferenceCourse,
} from "@/lib/academic/fee-estimates";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import {
  PUBLISHED_COURSE_PAGE_TAG,
  PUBLISHED_READ_REVALIDATE_SECONDS,
  publishedCourseYearTag,
} from "./published-cache";

type FeeReferenceRow = {
  academicCareer: string | null;
  college: string | null;
  subject: string | null;
  units: number | null;
  fees: { audience: FeeAudience; amount: number; basis: string }[];
};

async function readFeeEstimateTable(
  academicYear: number,
): Promise<FeeEstimateTable> {
  const { data, error } = await createPublicClient().rpc(
    "published_fee_reference_courses",
    { academic_year: academicYear },
  );
  if (error) throw error;
  if (!Array.isArray(data))
    throw new Error("The published fee references could not be read.");
  const references: FeeReferenceCourse[] = (
    data as unknown as FeeReferenceRow[]
  ).map((row) => ({
    year: academicYear,
    academicCareer: row.academicCareer,
    college: row.college,
    subject: row.subject,
    perUnit: Object.fromEntries(
      row.fees.map((fee) => [
        fee.audience,
        feePerUnit({ ...fee, units: row.units }),
      ]),
    ),
  }));
  return buildFeeEstimateTable(references);
}

/**
 * Median fees per unit for a year's groups of similar published courses. It
 * is derived from published fees on each read and never written back, so the
 * catalogue only ever holds what ANU listed.
 */
export function loadFeeEstimateTable(academicYear: number) {
  return unstable_cache(
    () => readFeeEstimateTable(academicYear),
    ["published-fee-estimate-table-v2", String(academicYear)],
    {
      revalidate: PUBLISHED_READ_REVALIDATE_SECONDS,
      tags: [PUBLISHED_COURSE_PAGE_TAG, publishedCourseYearTag(academicYear)],
    },
  )();
}

function hasListedFee(course: CourseDetails, audience: FeeAudience) {
  return course.fees.some(
    (fee) => fee.audience === audience && fee.amount !== null,
  );
}

/**
 * Adds estimates for courses missing a domestic or international fee. The
 * year's table is only read when at least one course needs it.
 */
export async function withFeeEstimates(
  courses: CourseDetails[],
): Promise<CourseDetails[]> {
  const needsEstimate = (course: CourseDetails) =>
    !hasListedFee(course, "domestic") || !hasListedFee(course, "international");
  const years = [
    ...new Set(courses.filter(needsEstimate).map((course) => course.year)),
  ];
  if (years.length === 0) return courses;
  const tables = new Map(
    await Promise.all(
      years.map(async (year) => {
        try {
          return [year, await loadFeeEstimateTable(year)] as const;
        } catch (error) {
          // An estimate is optional context. The published course and its
          // listed fees still load when the comparison read fails.
          console.error("Fee estimates could not be loaded.", error);
          return [year, null] as const;
        }
      }),
    ),
  );
  return courses.map((course) => {
    const table = tables.get(course.year);
    if (!table || !needsEstimate(course)) return course;
    const feeEstimates = courseFeeEstimates(
      table,
      {
        year: course.year,
        academicCareer: course.academicCareer,
        college: course.college,
        subject: course.subject,
      },
      {
        domestic: hasListedFee(course, "domestic"),
        international: hasListedFee(course, "international"),
      },
    );
    return feeEstimates ? { ...course, feeEstimates } : course;
  });
}
