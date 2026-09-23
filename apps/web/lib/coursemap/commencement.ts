/** How many past start years onboarding offers besides the current one. */
const EARLIEST_START_OFFSET = 5;

export function commencementYearOptions(currentYear: number) {
  return Array.from(
    { length: EARLIEST_START_OFFSET + 1 },
    (_, index) => currentYear - index,
  );
}

/**
 * Students follow the rules of the year they started. When Coursemap has not
 * published that year, the closest published year stands in, preferring the
 * later of two equally close years because its rules are the ones still
 * maintained.
 */
export function rulesYearForCommencement(
  commencementYear: number,
  publishedYears: readonly number[],
) {
  let closest: number | null = null;
  for (const year of publishedYears) {
    if (
      closest === null ||
      Math.abs(year - commencementYear) <
        Math.abs(closest - commencementYear) ||
      (Math.abs(year - commencementYear) ===
        Math.abs(closest - commencementYear) &&
        year > closest)
    ) {
      closest = year;
    }
  }
  return closest;
}
