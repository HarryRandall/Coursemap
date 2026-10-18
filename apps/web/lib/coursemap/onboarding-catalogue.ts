import "server-only";
import { unstable_cache } from "next/cache";
import {
  PUBLISHED_READ_REVALIDATE_SECONDS,
  PUBLISHED_STRUCTURE_DETAIL_TAG,
} from "@/lib/coursemap/published-cache";

import { createPublicClient } from "@/lib/supabase/public-server";

export type CatalogueYearOption = {
  id: number;
  year: number;
};

export type ProgrammeOption = {
  catalogueYear: number;
  code: string;
  description: string;
  durationYears: number | null;
  majorCodes: string[];
  minorCodes: string[];
  name: string;
  specialisationCodes: string[];
  units: number | null;
};

export type OnboardingCatalogue = {
  catalogueYears: CatalogueYearOption[];
  degrees: ProgrammeOption[];
  majors: ProgrammeOption[];
  minors: ProgrammeOption[];
  specialisations: ProgrammeOption[];
};

/**
 * Student choices come only from published versions. Students call a
 * programme a degree, so the component boundary keeps `degrees`.
 */
async function readOnboardingCatalogue(): Promise<OnboardingCatalogue> {
  const { data, error } = await createPublicClient().rpc(
    "published_onboarding_catalogue",
  );
  if (error) throw error;
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error("The published degree choices could not be read.");
  }
  const catalogue = data as unknown as OnboardingCatalogue;
  if (
    ![
      catalogue.catalogueYears,
      catalogue.degrees,
      catalogue.majors,
      catalogue.minors,
      catalogue.specialisations,
    ].every(Array.isArray)
  ) {
    throw new Error("The published degree choices could not be read.");
  }
  const sortOptions = (options: ProgrammeOption[]) =>
    options.toSorted((left, right) => left.name.localeCompare(right.name));
  return {
    catalogueYears: catalogue.catalogueYears.toSorted(
      (left, right) => right.year - left.year,
    ),
    degrees: sortOptions(catalogue.degrees),
    majors: sortOptions(catalogue.majors),
    minors: sortOptions(catalogue.minors),
    specialisations: sortOptions(catalogue.specialisations),
  };
}

export const loadOnboardingCatalogue = unstable_cache(
  readOnboardingCatalogue,
  ["published-onboarding-catalogue-v2"],
  {
    revalidate: PUBLISHED_READ_REVALIDATE_SECONDS,
    tags: [PUBLISHED_STRUCTURE_DETAIL_TAG],
  },
);
