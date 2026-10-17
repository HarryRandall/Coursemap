import type { CourseFee } from "@/lib/coursemap/course-types";

export const FEE_STATUSES = [
  "commonwealth_supported",
  "domestic_fee",
  "international",
] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

export function validFeeStatus(value: unknown): value is FeeStatus {
  return FEE_STATUSES.includes(value as FeeStatus);
}

/** The short form for tight labels, such as the tuition card's heading. */
export function feeStatusShortLabel(status: FeeStatus) {
  if (status === "commonwealth_supported") return "CSP";
  if (status === "domestic_fee") return "Domestic fee";
  return "International";
}

export function feeStatusLabel(status: FeeStatus) {
  if (status === "commonwealth_supported") return "Commonwealth supported";
  if (status === "domestic_fee") return "Domestic fee-paying";
  return "International";
}

/** Students who have not said are priced as most domestic undergraduates are. */
export const DEFAULT_FEE_STATUS: FeeStatus = "commonwealth_supported";

/** The published prices for one course, by who pays them. */
export type CoursePrices = {
  domestic: number | null;
  international: number | null;
  /** ANU's student contribution band code for Commonwealth supported places. */
  contributionBand: number | null;
};

/** ANU counts 48 units as one equivalent full-time study load (EFTSL). */
const UNITS_PER_EFTSL = 48;

/**
 * ANU's 2026 student contribution rates per EFTSL, by its band code. Combined
 * codes charge students who started before 2021 at their earlier band.
 * Source: https://www.anu.edu.au/student-contributions
 */
const CONTRIBUTION_RATES_2026: Record<
  number,
  { current: number; before2021: number }
> = {
  1: { current: 4738, before2021: 4738 },
  2: { current: 9537, before2021: 9537 },
  3: { current: 13558, before2021: 13558 },
  12: { current: 9537, before2021: 8164 },
  14: { current: 17399, before2021: 8164 },
  34: { current: 17399, before2021: 13624 },
};

/**
 * What one course costs a student, in 2026 published dollars. A Commonwealth
 * supported place pays its band's rate for the course's share of a full-time
 * year; fee-paying students pay the course's listed fee. Null when the price
 * that applies is not published.
 */
export function coursePrice({
  prices,
  units,
  feeStatus,
  commencementYear,
}: {
  prices: CoursePrices | undefined;
  units: number;
  feeStatus: FeeStatus;
  commencementYear: number | null;
}): number | null {
  if (!prices) return null;
  if (feeStatus === "international") return prices.international;
  if (feeStatus === "domestic_fee") return prices.domestic;
  const rate =
    prices.contributionBand === null
      ? undefined
      : CONTRIBUTION_RATES_2026[prices.contributionBand];
  if (!rate || units <= 0) return null;
  const annual =
    commencementYear !== null && commencementYear < 2021
      ? rate.before2021
      : rate.current;
  return Math.round((annual * units) / UNITS_PER_EFTSL);
}

/** The latest published row for one audience, taken without conversion. */
function latestFee(fees: CourseFee[], audience: CourseFee["audience"]) {
  return fees
    .filter((fee) => fee.audience === audience)
    .sort((a, b) => (b.feeYear ?? 0) - (a.feeYear ?? 0))
    .at(0);
}

/** Each audience's latest published price, and the course's contribution band. */
export function coursePrices(fees: CourseFee[]): CoursePrices {
  const priced = fees.filter((fee) => fee.amount !== null);
  return {
    domestic: latestFee(priced, "domestic")?.amount ?? null,
    international: latestFee(priced, "international")?.amount ?? null,
    contributionBand:
      latestFee(fees, "commonwealth_supported")?.studentContributionBand ??
      null,
  };
}
