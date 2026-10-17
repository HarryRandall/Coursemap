/** The audiences ANU lists a dollar fee for. */
export type FeeAudience = "domestic" | "international";

/** How closely the courses behind an estimate resemble the course. */
export type FeeEstimateScope = "subject" | "college" | "career";

/**
 * A fee inferred from similar courses because ANU's page listed none that
 * could be read. It is never the official fee.
 */
export type FeeEstimate = {
  /** Median published fee per unit across the similar courses. */
  perUnit: number;
  scope: FeeEstimateScope;
  /** The subject code, college name or academic career the courses share. */
  scopeValue: string;
  sampleSize: number;
};

/** Estimates for the audiences a course has no readable fee for. */
export type CourseFeeEstimates = Partial<Record<FeeAudience, FeeEstimate>>;

/** One published course's fees, reduced to what the estimator compares. */
export type FeeReferenceCourse = {
  year: number;
  academicCareer: string | null;
  college: string | null;
  subject: string | null;
  /** Published fee per unit, or null when the course lists none. */
  perUnit: Partial<Record<FeeAudience, number | null>>;
};

/** What identifies the courses similar to one being estimated. */
export type FeeEstimateTarget = {
  year: number;
  academicCareer: string | null;
  college: string | null;
  subject: string | null;
};

/**
 * Median fee per unit for each group of similar courses that is large enough
 * to estimate from. Keyed by `feeGroupKey`, so it serialises as plain JSON.
 */
export type FeeEstimateTable = Record<
  string,
  { perUnit: number; sampleSize: number }
>;

/** Fewer published fees than this and a group is too thin to estimate from. */
export const FEE_ESTIMATE_MINIMUM_SAMPLE = 5;

const SCOPES: FeeEstimateScope[] = ["subject", "college", "career"];

function scopeValue(target: FeeEstimateTarget, scope: FeeEstimateScope) {
  if (scope === "subject") return target.subject;
  if (scope === "college") return target.college;
  return target.academicCareer;
}

/**
 * Groups never cross a year, audience or academic career, because ANU prices
 * undergraduate, postgraduate and research courses differently.
 */
function feeGroupKey(
  target: FeeEstimateTarget,
  audience: FeeAudience,
  scope: FeeEstimateScope,
) {
  const value = scopeValue(target, scope);
  if (!value || !target.academicCareer) return null;
  return [target.year, audience, target.academicCareer, scope, value].join("|");
}

function median(values: number[]) {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A listed fee as dollars per unit. A course fee is spread over its fixed unit
 * value; a fee without a usable basis or unit value is left out.
 */
export function feePerUnit(fee: {
  amount: number | null;
  basis: string;
  units: number | null;
}) {
  if (fee.amount === null || fee.amount <= 0) return null;
  if (fee.basis === "unit") return fee.amount;
  if (fee.basis === "course" && fee.units !== null && fee.units > 0) {
    return fee.amount / fee.units;
  }
  return null;
}

export function buildFeeEstimateTable(
  courses: readonly FeeReferenceCourse[],
): FeeEstimateTable {
  const samples = new Map<string, number[]>();
  for (const course of courses) {
    for (const audience of ["domestic", "international"] as const) {
      const perUnit = course.perUnit[audience];
      if (perUnit === null || perUnit === undefined) continue;
      for (const scope of SCOPES) {
        const key = feeGroupKey(course, audience, scope);
        if (!key) continue;
        samples.set(key, [...(samples.get(key) ?? []), perUnit]);
      }
    }
  }
  const table: FeeEstimateTable = {};
  for (const [key, values] of samples) {
    if (values.length < FEE_ESTIMATE_MINIMUM_SAMPLE) continue;
    table[key] = { perUnit: median(values), sampleSize: values.length };
  }
  return table;
}

/**
 * The fee per unit of the closest group of similar courses: the same subject
 * code, then the same college, then the whole academic career, all within the
 * same year. Null when no group has enough published fees.
 */
export function estimateFee(
  table: FeeEstimateTable,
  target: FeeEstimateTarget,
  audience: FeeAudience,
): FeeEstimate | null {
  for (const scope of SCOPES) {
    const key = feeGroupKey(target, audience, scope);
    const group = key ? table[key] : undefined;
    if (group) {
      return {
        perUnit: group.perUnit,
        scope,
        scopeValue: scopeValue(target, scope) ?? "",
        sampleSize: group.sampleSize,
      };
    }
  }
  return null;
}

/**
 * Estimates only for the audiences whose fee is missing, so a fee ANU did
 * publish is never replaced. Returns undefined when nothing needed estimating
 * or no estimate was possible.
 */
export function courseFeeEstimates(
  table: FeeEstimateTable,
  target: FeeEstimateTarget,
  listed: Record<FeeAudience, boolean>,
): CourseFeeEstimates | undefined {
  const estimates: CourseFeeEstimates = {};
  for (const audience of ["domestic", "international"] as const) {
    if (listed[audience]) continue;
    const estimate = estimateFee(table, target, audience);
    if (estimate) estimates[audience] = estimate;
  }
  return Object.keys(estimates).length ? estimates : undefined;
}

/**
 * An estimate's dollars for a number of units, rounded to the nearest $10 so
 * it does not read as an exact figure.
 */
export function estimatedFeeAmount(estimate: FeeEstimate, units: number) {
  return Math.round((estimate.perUnit * units) / 10) * 10;
}

const CAREER_LABELS: Record<string, string> = {
  UGRD: "undergraduate",
  PGRD: "postgraduate",
  RSCH: "research",
};

/** Which courses an estimate came from, for a sentence such as "from 12 similar COMP courses". */
export function feeEstimateSource(estimate: FeeEstimate) {
  const count = `${estimate.sampleSize} similar`;
  if (estimate.scope === "subject") {
    return `${count} ${estimate.scopeValue} courses`;
  }
  if (estimate.scope === "college") {
    return `${count} courses in the ${estimate.scopeValue}`;
  }
  const career = CAREER_LABELS[estimate.scopeValue];
  return career ? `${count} ${career} courses` : `${count} courses`;
}

/** The sentence shown beside an estimated fee, so it never reads as official. */
export function feeEstimateNote(estimate: FeeEstimate) {
  return `Estimated from the median of ${feeEstimateSource(estimate)}. ANU's page didn't list a fee we could read, so this isn't the official fee.`;
}
