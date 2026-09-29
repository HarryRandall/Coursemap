export type CommencementYearBounds = {
  minimumCommencementYear?: number | null;
  maximumCommencementYear?: number | null;
};

export function validCommencementYear(year: unknown): year is number {
  return (
    typeof year === "number" &&
    Number.isInteger(year) &&
    year >= 1900 &&
    year <= 9999
  );
}

export function validCommencementYearBounds(bounds: CommencementYearBounds) {
  const minimum = bounds.minimumCommencementYear ?? null;
  const maximum = bounds.maximumCommencementYear ?? null;
  const validYear = (year: number | null) =>
    year === null || validCommencementYear(year);
  return (
    (minimum !== null || maximum !== null) &&
    validYear(minimum) &&
    validYear(maximum) &&
    (minimum === null || maximum === null || minimum <= maximum)
  );
}

/** Inclusive calendar-year bounds, separate from a student's year standing. */
export function commencementYearLabel(bounds: CommencementYearBounds) {
  const minimum = bounds.minimumCommencementYear ?? null;
  const maximum = bounds.maximumCommencementYear ?? null;
  if (minimum !== null && maximum !== null)
    return minimum === maximum
      ? `Commenced in ${minimum}`
      : `Commenced between ${minimum} and ${maximum}`;
  if (minimum !== null) return `Commenced in or after ${minimum}`;
  if (maximum !== null) return `Commenced in or before ${maximum}`;
  return "Set the commencement year range";
}
