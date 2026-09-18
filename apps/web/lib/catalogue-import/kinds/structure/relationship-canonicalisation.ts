import type { AcademicStructureExtraction } from "./contract.ts";

/**
 * The relationship table's natural key excludes position and provenance.
 * Collapse repeated references before persistence while retaining every
 * distinct source passage on the one canonical row.
 *
 * Keep this helper browser-safe because the manual snapshot editor normalises
 * draft rows before it submits them to the server action.
 */
export function canonicaliseAcademicStructureRelationships(
  relationships: AcademicStructureExtraction["relationships"],
) {
  const ordered = relationships
    .map((relationship, index) => ({ relationship, index }))
    .sort(
      (left, right) =>
        left.relationship.position - right.relationship.position ||
        left.index - right.index,
    );
  const canonical = new Map<
    string,
    AcademicStructureExtraction["relationships"][number]
  >();

  for (const { relationship } of ordered) {
    const key = [
      relationship.relationshipKind,
      relationship.targetKind,
      relationship.targetCode,
    ].join(":");
    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, { ...relationship });
      continue;
    }
    canonical.set(key, {
      ...existing,
      targetTitle: existing.targetTitle ?? relationship.targetTitle,
      sourceText: [
        ...new Set([existing.sourceText, relationship.sourceText]),
      ].join("\n\n"),
      sourceLocator: [
        ...new Set([existing.sourceLocator, relationship.sourceLocator]),
      ].join(", "),
    });
  }

  return [...canonical.values()].map((relationship, index) => ({
    ...relationship,
    position: index + 1,
  }));
}
