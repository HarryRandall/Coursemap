import type { AcademicStructureKind } from "@/lib/structure-import/contract";

const ADMIN_COLLECTION_PATHS = {
  programme: "/admin/programmes",
  major: "/admin/majors",
  minor: "/admin/minors",
  specialisation: "/admin/specialisations",
} as const satisfies Record<AcademicStructureKind, string>;

export function adminAcademicStructureCollectionPath(
  kind: AcademicStructureKind,
) {
  return ADMIN_COLLECTION_PATHS[kind];
}

export function adminAcademicStructureDetailPath({
  kind,
  publicId,
}: {
  kind: AcademicStructureKind;
  publicId: string;
}) {
  return `${adminAcademicStructureCollectionPath(kind)}/${encodeURIComponent(publicId)}`;
}

export function allAdminAcademicStructureCollectionPaths() {
  return Object.values(ADMIN_COLLECTION_PATHS);
}

/** Imports live under the directory of the kind they belong to. */
export function adminAcademicStructureImportsPath(kind: AcademicStructureKind) {
  return `${adminAcademicStructureCollectionPath(kind)}/imports`;
}

/**
 * A review decision knows its target but not its kind, so revalidation covers
 * every kind's import routes. Each is a cheap tag invalidation.
 */
export function allAdminAcademicStructureImportPaths() {
  return Object.values(ADMIN_COLLECTION_PATHS).map((base) => `${base}/imports`);
}
