import { enrolmentModeForProgramme } from "@/lib/academic/enrolment-mode";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";

/** Code, duration and units, for the muted line under a structure's name. */
export function programmeOptionMeta(option: ProgrammeOption) {
  return [
    option.code,
    option.durationYears
      ? `${option.durationYears} ${option.durationYears === 1 ? "year" : "years"}`
      : null,
    option.units ? `${option.units} units` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A programme of a year or less, such as an Honours year or a graduate
 * diploma, is added after a degree rather than started on, so degree lists
 * keep it out of the way until asked for.
 */
export function isOneYearProgramme(option: ProgrammeOption) {
  return option.durationYears !== null && option.durationYears <= 1;
}

export const DEGREE_FILTERS = [
  { value: "three-years", label: "3 years" },
  { value: "four-years", label: "4+ years" },
  { value: "double", label: "Double degrees" },
  { value: "one-year", label: "One-year" },
] as const;

export type DegreeFilter = (typeof DEGREE_FILTERS)[number]["value"];

/**
 * Whether a degree belongs in the list for the chosen filter. With no filter
 * every degree a student could start on is listed, so one-year programmes
 * appear only under their own filter.
 */
export function matchesDegreeFilter(
  option: ProgrammeOption,
  filter: DegreeFilter | null,
) {
  if (filter === "one-year") return isOneYearProgramme(option);
  if (isOneYearProgramme(option)) return false;
  if (filter === "three-years") return option.durationYears === 3;
  if (filter === "four-years")
    return option.durationYears !== null && option.durationYears >= 4;
  if (filter === "double")
    return enrolmentModeForProgramme(option) !== "single_degree";
  return true;
}
