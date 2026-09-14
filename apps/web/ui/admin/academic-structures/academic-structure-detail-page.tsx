import { catalogueWorkspaceIdentity } from "@/lib/coursemap/catalogue-workspace-identity";
import {
  loadCatalogueSectionReview,
  loadCatalogueReviewHistory,
} from "@/lib/coursemap/catalogue-section-review-actions";
import { catalogueVersion } from "@/lib/coursemap/catalogue-version";
import { notFound } from "next/navigation";
import { ProgrammeReview } from "@/app/admin/programmes/[id]/programme-review";
import { canWriteCatalogue, canManageCourseImports } from "@/lib/auth/viewer";
import { loadAdminStructureReview } from "@/lib/coursemap/admin-catalogue";
import { loadStructureWorkspaceEntry } from "@/lib/coursemap/structure-workspace-entry";
import { loadAcademicStructureImportTargetDetail } from "@/lib/coursemap/admin-academic-structure-imports";
import { academicStructureImportQueuesEnabled } from "@/lib/structure-import/queue";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";
import { StructureEmptyWorkspace } from "./structure-empty-workspace";

export async function AcademicStructureDetailPage({
  expectedKind,
  params,
  searchParams,
  pageView,
  versionPublicId,
}: {
  expectedKind: AcademicStructureKind;
  pageView?: "history" | "preview";
  versionPublicId?: string;
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    year?: string;
    view?: string;
    import?: string;
    snapshot?: string;
  }>;
}) {
  const [{ id }, query, canWrite, canReviewImports] = await Promise.all([
    params,
    searchParams,
    canWriteCatalogue(),
    canManageCourseImports(),
  ]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      id,
    ) ||
    "view" in query ||
    "snapshot" in query ||
    "year" in query
  )
    notFound();
  const workspace = await catalogueWorkspaceIdentity(expectedKind, id);
  if (!workspace) notFound();
  const year = workspace.year;
  const version = versionPublicId
    ? await catalogueVersion(expectedKind, versionPublicId)
    : null;
  if (versionPublicId && !version) notFound();
  const snapshotId = version?.id;
  const view = pageView ?? "review";
  const [record, entry] = await Promise.all([
    loadAdminStructureReview(workspace.identityId, year, snapshotId),
    loadStructureWorkspaceEntry(
      workspace.identityId,
      expectedKind,
      year,
      canReviewImports,
    ),
  ]);
  if (!entry || (snapshotId !== undefined && record?.id !== snapshotId))
    notFound();
  const target =
    entry.imports.find((item) => item.id === query.import) ?? entry.imports[0];
  const importDetail =
    canReviewImports && view === "history" && target
      ? await loadAcademicStructureImportTargetDetail({
          structureKind: expectedKind,
          targetId: target.id,
          includeRelationalData: false,
        })
      : null;
  const canImport =
    canReviewImports &&
    entry.importEnabled &&
    academicStructureImportQueuesEnabled();
  if (!record)
    return (
      <StructureEmptyWorkspace
        entry={{ ...entry, publicId: id }}
        detail={importDetail}
        canImport={canImport}
      />
    );
  return (
    <ProgrammeReview
      canEdit={canWrite}
      canPublish={canWrite}
      canReviewImports={canReviewImports}
      reviewHistory={
        view === "history" && record
          ? await loadCatalogueReviewHistory(
              expectedKind,
              record.structureYearId,
            )
          : []
      }
      sectionReviews={
        canWrite
          ? await loadCatalogueSectionReview(
              expectedKind,
              record.structureYearId,
              record.id,
            )
          : []
      }
      record={{ ...record, publicId: id }}
      entry={{ ...entry, publicId: id }}
      importDetail={importDetail}
      canImport={canImport}
    />
  );
}
