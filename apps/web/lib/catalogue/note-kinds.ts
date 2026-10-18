/**
 * How an uncheckable `other` note is shown. Every note is advisory and never
 * blocks a plan; the kind only labels it. `required` is a mandatory condition
 * such as a police check, `recommended` is advice such as prose assumed
 * knowledge, and `check_with_anu` is ANU wording the importer could not model,
 * published verbatim for a person to review. An ordinary note has no kind.
 */
export type RequirementNoteKind = "required" | "recommended" | "check_with_anu";

export const REQUIREMENT_NOTE_KINDS: readonly RequirementNoteKind[] = [
  "required",
  "recommended",
  "check_with_anu",
];

/** The note kind a stored value names, or null for an ordinary note. */
export function requirementNoteKind(
  value: unknown,
): RequirementNoteKind | null {
  return REQUIREMENT_NOTE_KINDS.find((kind) => kind === value) ?? null;
}
