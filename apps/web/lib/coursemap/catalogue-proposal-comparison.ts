/** Review content, excluding evidence bookkeeping that has its own source view. */
const provenanceFields = new Set([
  "projectionSha256",
  "schemaVersion",
  "sourceLocator",
  "sourceExcerpt",
  "createdAt",
  "sourceUpdatedAt",
  "evidence",
  "validationStatus",
  "overallConfidence",
]);

export type CatalogueProposalField = {
  key: string;
  before: unknown;
  after: unknown;
};

export function catalogueFieldLabel(value: string) {
  return value
    .replace(/^snapshot[.]/, "")
    .replaceAll("_", " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function reviewableCatalogueValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviewableCatalogueValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !provenanceFields.has(key))
        .map(([key, child]) => [key, reviewableCatalogueValue(child)]),
    );
  }
  return value;
}

export function compareCatalogueProposal(
  before: unknown,
  after: unknown,
): CatalogueProposalField[] {
  const flatten = (value: unknown) => {
    const record = reviewableCatalogueValue(value) as Record<
      string,
      unknown
    > | null;
    if (!record) return {};
    const { snapshot, ...relations } = record;
    return {
      ...relations,
      ...(typeof snapshot === "object" && snapshot !== null ? snapshot : {}),
    };
  };
  const oldFields: Record<string, unknown> = flatten(before);
  const newFields: Record<string, unknown> = flatten(after);
  return [...new Set([...Object.keys(oldFields), ...Object.keys(newFields)])]
    .filter(
      (key) =>
        JSON.stringify(oldFields[key]) !== JSON.stringify(newFields[key]),
    )
    .map((key) => ({
      key,
      before: oldFields[key] ?? null,
      after: newFields[key] ?? null,
    }));
}
