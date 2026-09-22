import { notFound } from "next/navigation";
import { TabsContent } from "@coursemap/ui/primitives/tabs";
import {
  canManageCatalogueSources,
  canWriteCatalogue,
  getAuthViewer,
} from "@/lib/auth/viewer";
import {
  createCatalogueDraft,
  loadCatalogueDraft,
} from "@/lib/catalogue/drafts";
import { diffSnapshotWrites } from "@/lib/catalogue-import/changes";
import { contentHashForCatalogueContent } from "@/lib/catalogue-import/version-content";
import { loadSourceReview } from "@/lib/catalogue/source-review-store";
import { CHANGELOG_PAGE_SIZE } from "@/lib/catalogue/changelog";
import { loadCatalogueChangelog } from "@/lib/coursemap/admin-catalogue-changelog";
import {
  loadCatalogueRecord,
  loadVersionCoursePreview,
  loadVersionWrite,
} from "@/lib/coursemap/admin-catalogue-record";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
  adminCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { AppShell } from "@/ui/shell";
import { CatalogueChangesPanel } from "./changes/changes-panel";
import { ChangelogTimeline } from "./changelog/changelog-timeline";
import { RecordHeader } from "./record-header";
import { RecordTabList, RecordTabs, type RecordSection } from "./record-tabs";
import { CatalogueContentEditor } from "./content-editor";
import { CoursePreview, StructurePreview } from "./version-preview";

function FoundationEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export async function CatalogueRecordPage({
  kind,
  code,
  academicYear,
  section = "content",
  changelogEvents = CHANGELOG_PAGE_SIZE,
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  section?: RecordSection;
  /** How many raw audit events the changelog reads before paging. */
  changelogEvents?: number;
}) {
  const [canManageImports, canWrite] = await Promise.all([
    canManageCatalogueSources(),
    canWriteCatalogue(),
  ]);
  if (!canManageImports && !canWrite) return <AccessDeniedError />;
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  )
    notFound();
  const record = await loadCatalogueRecord({ kind, code, academicYear });
  if (!record) notFound();

  const labels = CATALOGUE_KIND_LABELS[kind];
  const path = adminCatalogueRecordPath(kind, academicYear, record.code);
  const viewer = canWrite ? await getAuthViewer() : null;
  const draft =
    section === "content" && viewer
      ? await createCatalogueDraft({
          recordId: record.recordId,
          userId: viewer.id,
        })
      : await loadCatalogueDraft(record.recordId);
  const [studentContent, studentCourse] = await Promise.all([
    record.publishedVersionId
      ? loadVersionWrite(record.publishedVersionId)
      : null,
    record.publishedVersionId && kind === "course"
      ? loadVersionCoursePreview(record.publishedVersionId)
      : null,
  ]);
  const hasUnpublishedChanges = Boolean(
    draft &&
    (!studentContent ||
      draft.contentHash !== contentHashForCatalogueContent(studentContent)),
  );
  const review = await loadSourceReview(
    record.recordId,
    draft?.content ?? null,
  );
  const unpublished = draft
    ? diffSnapshotWrites(studentContent, draft.content)
    : [];
  const changelog = await loadCatalogueChangelog({
    recordId: record.recordId,
    limit: Math.min(Math.max(changelogEvents, CHANGELOG_PAGE_SIZE), 400),
  });
  const versionOrdinals = new Map(
    [...record.versions]
      .sort((left, right) => left.id - right.id)
      .map((version, index) => [version.id, index + 1]),
  );
  const openChanges =
    (review?.conflicts.length ?? 0) + (review?.incoming.length ?? 0);

  return (
    <RecordTabs value={section} path={path}>
      <AppShell
        admin
        currentBreadcrumbLabel={record.code}
        breadcrumbSegmentLabels={{
          [labels.segment]: labels.plural,
          [String(academicYear)]: String(academicYear),
        }}
        tabs={<RecordTabList changeCount={openChanges} />}
      >
        <div className="flex w-full min-w-0 flex-col gap-6">
          <RecordHeader
            record={record}
            hasDraft={draft !== null}
            hasUnpublishedChanges={hasUnpublishedChanges}
            canSync={canManageImports}
            openChangeCount={openChanges}
            conflictCount={review?.conflicts.length ?? 0}
          />
          <TabsContent value="content" className="mt-0">
            {draft && canWrite ? (
              <CatalogueContentEditor
                key={`${draft.contentHash}:${draft.revision}:${record.publishedVersionId ?? "unpublished"}`}
                initial={draft.content}
                recordId={record.recordId}
                initialRevision={draft.revision}
                initiallyPublished={record.publishedVersionId !== null}
                initialHasUnpublishedChanges={hasUnpublishedChanges}
                path={path}
              />
            ) : draft ? (
              <StructurePreview write={draft.content} />
            ) : (
              <FoundationEmpty
                title={`${labels.singular} content is not available`}
                description={`You need catalogue write permission to author this ${labels.singular.toLowerCase()}.`}
              />
            )}
          </TabsContent>
          <TabsContent value="student-view" className="mt-0">
            {studentCourse ? (
              <CoursePreview course={studentCourse} />
            ) : studentContent ? (
              <StructurePreview write={studentContent} />
            ) : (
              <FoundationEmpty
                title={`This ${labels.singular.toLowerCase()} hasn't been published yet`}
                description="Student view will show the published version when one is available."
              />
            )}
          </TabsContent>
          <TabsContent value="changes" className="mt-0">
            <CatalogueChangesPanel
              canWrite={canWrite}
              hasEverSynced={record.syncs.length > 0}
              isPublished={record.publishedVersionId !== null}
              kindLabel={labels.singular.toLowerCase()}
              path={path}
              recordId={record.recordId}
              review={review}
              unpublished={unpublished}
            />
          </TabsContent>
          <TabsContent value="changelog" className="mt-0">
            <ChangelogTimeline
              changelog={changelog}
              path={path}
              versionOrdinals={versionOrdinals}
            />
          </TabsContent>
        </div>
      </AppShell>
    </RecordTabs>
  );
}
