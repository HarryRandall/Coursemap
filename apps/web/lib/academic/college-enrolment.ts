export type ProgrammeCollege = { code: string; college: string | null };

function collegeNameKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/** Matches published affiliations, without guessing abbreviations or college mergers. */
export function collegeEnrolmentStatus(
  college: string,
  programmeCodes: readonly string[],
  programmes: readonly ProgrammeCollege[] = [],
): "met" | "unmet" | "unknown" {
  const wanted = collegeNameKey(college);
  if (!wanted || programmeCodes.length === 0) return "unknown";
  let missing = false;
  for (const code of programmeCodes) {
    const affiliations = programmes.filter(
      (programme) => programme.code.toUpperCase() === code.toUpperCase(),
    );
    const colleges = new Set(
      affiliations.flatMap((programme) =>
        programme.college?.trim() ? [collegeNameKey(programme.college)] : [],
      ),
    );
    // Different year snapshots must not silently choose an affiliation.
    if (
      colleges.size !== 1 ||
      affiliations.some((item) => !item.college?.trim())
    ) {
      missing = true;
      continue;
    }
    if (colleges.has(wanted)) return "met";
  }
  return missing ? "unknown" : "unmet";
}
