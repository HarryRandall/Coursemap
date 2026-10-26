import type { CourseFee } from "@/lib/coursemap/course-types";
import {
  estimatedFeeAmount,
  type CourseFeeEstimates,
  type FeeAudience,
  type FeeEstimate,
} from "@/lib/academic/fee-estimates";

export const FEE_STATUSES = [
  "commonwealth_supported",
  "domestic_fee",
  "international",
] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

export function validFeeStatus(value: unknown): value is FeeStatus {
  return FEE_STATUSES.includes(value as FeeStatus);
}

/** The short form for tight labels, such as the tuition card's fee badge. */
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
  /** Audiences whose listed fee is charged per unit rather than per course. */
  perUnit?: Partial<Record<FeeAudience, boolean>>;
  /** Estimates from similar courses for audiences with no readable fee. */
  estimates?: CourseFeeEstimates;
};

/** What a course costs a student, and whether that is an estimate. */
export type CoursePriceQuote = {
  amount: number;
  /** Set when ANU listed no readable fee and similar courses priced it. */
  estimate: FeeEstimate | null;
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

/** The fee-paying audience whose listed fee applies to a student. */
function feeAudience(status: FeeStatus): FeeAudience | null {
  if (status === "international") return "international";
  if (status === "domestic_fee") return "domestic";
  return null;
}

/**
 * What one course costs a student, in 2026 published dollars. A Commonwealth
 * supported place pays its band's rate for the course's share of a full-time
 * year; fee-paying students pay the course's listed fee, or an estimate from
 * similar courses when ANU listed none it could read. Null when neither is
 * available.
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
}): CoursePriceQuote | null {
  if (!prices) return null;
  const audience = feeAudience(feeStatus);
  if (audience) {
    const listed = prices[audience];
    if (listed !== null) {
      return {
        amount: prices.perUnit?.[audience] ? listed * units : listed,
        estimate: null,
      };
    }
    const estimate = prices.estimates?.[audience];
    return estimate && units > 0
      ? { amount: estimatedFeeAmount(estimate, units), estimate }
      : null;
  }
  const rate =
    prices.contributionBand === null
      ? undefined
      : CONTRIBUTION_RATES_2026[prices.contributionBand];
  if (!rate || units <= 0) return null;
  const annual =
    commencementYear !== null && commencementYear < 2021
      ? rate.before2021
      : rate.current;
  return {
    amount: Math.round((annual * units) / UNITS_PER_EFTSL),
    estimate: null,
  };
}

/** The latest published row for one audience, taken without conversion. */
function latestFee(fees: CourseFee[], audience: CourseFee["audience"]) {
  return fees
    .filter((fee) => fee.audience === audience)
    .sort((a, b) => (b.feeYear ?? 0) - (a.feeYear ?? 0))
    .at(0);
}

/**
 * Each audience's latest published price, and the course's contribution band.
 * An estimate is kept only for an audience with no readable price, so it can
 * never stand in for a fee ANU published.
 */
export function coursePrices(
  fees: CourseFee[],
  estimates?: CourseFeeEstimates,
): CoursePrices {
  const priced = fees.filter((fee) => fee.amount !== null);
  const listed = {
    domestic: latestFee(priced, "domestic"),
    international: latestFee(priced, "international"),
  };
  const prices: CoursePrices = {
    domestic: listed.domestic?.amount ?? null,
    international: listed.international?.amount ?? null,
    contributionBand:
      latestFee(fees, "commonwealth_supported")?.studentContributionBand ??
      null,
  };
  const perUnit: Partial<Record<FeeAudience, boolean>> = {};
  const missing: CourseFeeEstimates = {};
  for (const audience of ["domestic", "international"] as const) {
    const fee = listed[audience];
    if (fee?.basis === "unit") perUnit[audience] = true;
    const estimate = estimates?.[audience];
    if (!fee && estimate) missing[audience] = estimate;
  }
  if (Object.keys(perUnit).length) prices.perUnit = perUnit;
  if (Object.keys(missing).length) prices.estimates = missing;
  return prices;
}
