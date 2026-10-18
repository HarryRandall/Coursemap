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

const VERSION_BATCH_SIZE = 100;

type SummaryRow = {
  academic_career: string | null;
  college: string | null;
  subject_code: string | null;
  units: number | null;
  version_id: number | null;
};

type FeeRow = {
  amount: number | null;
  audience: string;
  basis: string;
  fee_year: number | null;
  version_id: number;
};

async function publishedVersionIds(academicYear: number) {
  const supabase = createPublicClient();
  const { data: year, error: yearError } = await supabase
    .from("academic_years")
    .select("id")
    .eq("year", academicYear)
    .maybeSingle();
  if (yearError) throw yearError;
  if (!year) return [];
  const versionIds: number[] = [];
  // Read the indexed publication pointers rather than filtering the summary
  // view, which evaluates catalogue policies across every year first.
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("catalogue_records")
      .select("published_version_id")
      .eq("kind", "course")
      .eq("academic_year_id", year.id)
      .is("archived_at", null)
      .not("published_version_id", "is", null)
      .order("id")
      .range(start, start + 999);
    if (error) throw error;
    for (const record of data ?? []) {
      if (record.published_version_id !== null) {
        versionIds.push(record.published_version_id);
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  return versionIds;
}

async function referenceBatch(
  academicYear: number,
  versionIds: number[],
): Promise<FeeReferenceCourse[]> {
  const supabase = createPublicClient();
  const [summaries, fees] = await Promise.all([
    supabase
      .from("published_course_summaries")
      .select("academic_career,college,subject_code,units,version_id")
      .in("version_id", versionIds),
    supabase
      .from("course_fees")
      .select("amount,audience,basis,fee_year,version_id")
      .in("version_id", versionIds)
      .in("audience", ["domestic", "international"])
      .not("amount", "is", null),
  ]);
  if (summaries.error) throw summaries.error;
  if (fees.error) throw fees.error;
  const feesByVersion = new Map<number, FeeRow[]>();
  for (const fee of (fees.data ?? []) as FeeRow[]) {
    feesByVersion.set(fee.version_id, [
      ...(feesByVersion.get(fee.version_id) ?? []),
      fee,
    ]);
  }
  return ((summaries.data ?? []) as SummaryRow[]).flatMap((row) => {
    if (row.version_id === null) return [];
    const rows = feesByVersion.get(row.version_id) ?? [];
    const units = row.units === null ? null : Number(row.units);
    const perUnit = (audience: FeeAudience) => {
      // The latest fee year wins, as it does when pricing the course itself.
      const latest = rows
        .filter((fee) => fee.audience === audience)
        .sort((a, b) => (b.fee_year ?? 0) - (a.fee_year ?? 0))
        .at(0);
      return latest
        ? feePerUnit({
            amount: latest.amount === null ? null : Number(latest.amount),
            basis: latest.basis,
            units,
          })
        : null;
    };
    return [
      {
        year: academicYear,
        academicCareer: row.academic_career,
        college: row.college,
        subject: row.subject_code,
        perUnit: {
          domestic: perUnit("domestic"),
          international: perUnit("international"),
        },
      },
    ];
  });
}

async function readFeeEstimateTable(
  academicYear: number,
): Promise<FeeEstimateTable> {
  const versionIds = await publishedVersionIds(academicYear);
  const references: FeeReferenceCourse[] = [];
  for (let start = 0; start < versionIds.length; start += VERSION_BATCH_SIZE) {
    references.push(
      ...(await referenceBatch(
        academicYear,
        versionIds.slice(start, start + VERSION_BATCH_SIZE),
      )),
    );
  }
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
    ["published-fee-estimate-table", String(academicYear)],
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
