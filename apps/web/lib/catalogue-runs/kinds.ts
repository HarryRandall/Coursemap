import type { CatalogueKind } from "../catalogue/content.ts";

export const BULK_IMPORT_KINDS = [
  "course",
  "major",
  "minor",
  "specialisation",
] as const;
export type BulkImportKind = (typeof BULK_IMPORT_KINDS)[number];

export function isBulkImportKind(value: unknown): value is BulkImportKind {
  return BULK_IMPORT_KINDS.some((kind) => kind === value);
}

export function importPublicationPermission(kind: CatalogueKind) {
  return kind === "course" ? "courses.write" : "catalogue.write";
}

export function importKindLabel(
  kind: BulkImportKind = "course",
  plural = true,
) {
  return `${kind}${plural ? "s" : ""}`;
}
