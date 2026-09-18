const ANU_COURSE_CODE_IN_TEXT_PATTERN =
  /(?<![A-Z0-9_])[A-Z]{4}\d{4}[A-Z]?(?![A-Z0-9_])/giu;

/**
 * Extract exact ANU course codes mentioned in source wording. These are
 * descriptive references only and do not imply any prerequisite semantics.
 */
export function extractAnuCourseCodes(
  sourceText: string | null | undefined,
): string[] {
  if (!sourceText) return [];
  return [
    ...new Set(
      (sourceText.match(ANU_COURSE_CODE_IN_TEXT_PATTERN) ?? []).map((code) =>
        code.toUpperCase(),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
}
