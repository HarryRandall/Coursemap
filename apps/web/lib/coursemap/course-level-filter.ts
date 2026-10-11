/** Directory levels use digits; requirement ranges retain both inclusive bounds. */
export function courseLevelBounds(value: string) {
  const match = /^([1-9])(?:(\+)|-([1-9]))?$/u.exec(value);
  if (!match) return null;
  const minimum = Number(match[1]) * 1000;
  const maximum = match[2] ? null : Number(match[3] ?? match[1]) * 1000;
  return maximum !== null && maximum < minimum ? null : { minimum, maximum };
}
