/**
 * The one place the negation convention lives. A filter value carries its
 * operator as a leading "!", so "!queued" reads as "is not queued" and the
 * whole filter still fits in a single shareable URL parameter.
 *
 * Both halves of the round trip import from here — the FilterBar that writes
 * the parameter and the pages that read it — so the convention cannot drift
 * on one side and silently return an empty table on the other.
 */
export type NegatableValue = {
  value: string;
  negated: boolean;
};

/** Splits a raw parameter into its value and whether it was negated. */
export function parseNegatableValue(raw: string): NegatableValue {
  return raw.startsWith("!")
    ? { value: raw.slice(1), negated: true }
    : { value: raw, negated: false };
}

/** The URL form of a filter value. An empty value clears the filter. */
export function encodeNegatableValue(value: string, negated: boolean) {
  if (!value) return "";
  return negated ? `!${value}` : value;
}
