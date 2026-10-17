import type { Profile } from "./types";

/** The majors, minors and specialisations a student has chosen on their plan. */
export function planStructureCodes(
  profile: Pick<Profile, "majorCode" | "minorCodes" | "specialisationCodes">,
): string[] {
  return [
    ...new Set(
      [
        profile.majorCode,
        ...(profile.minorCodes ?? []),
        ...(profile.specialisationCodes ?? []),
      ].filter(Boolean),
    ),
  ];
}
