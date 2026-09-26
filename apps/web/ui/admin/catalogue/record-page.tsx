import { notFound } from "next/navigation";
import { TabsContent } from "@coursemap/ui/primitives/tabs";
import {
  canManageCatalogueOperations,
  canWriteCatalogue,
} from "@/lib/auth/viewer";
import { loadCatalogueEditorState } from "@/lib/catalogue/drafts";
import { diffSnapshotWrites } from "@/lib/catalogue-import/changes";
import { contentHashForCatalogueContent } from "@/lib/catalogue-import/version-content";
import { loadSourceReview } from "@/lib/catalogue/source-review-store";
import { CHANGELOG_PAGE_SIZE } from "@/lib/catalogue/changelog";
import { loadCatalogueChangelog } from "@/lib/coursemap/admin-catalogue-changelog";
import {
  loadCatalogueRecord,
  loadVersionCoursePreview,
  loadVersionReviewNotes,
  loadVersionWrite,
} from "@/lib/coursemap/admin-catalogue-record";
import {
  classifyFirstRead,
  isCertainFirstRead,
} from "@/lib/catalogue/first-read";
import { summariseReviewNotes } from "@/lib/catalogue/review-notes";
import { courseDetailsFromWrite } from "@/lib/coursemap/course-version-view";
import {
  ADMIN_CATALOGUE_OPERATIONS_PATH,
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
  adminCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { AppShell } from "@/ui/shell";
import { CatalogueChangesPanel } from "./changes/changes-panel";
import { ChangelogTimeline } from "./changelog/changelog-timeline";
import { RecordHeader } from "./record-header";
import { StudentViewPanel } from "./student-view-panel";
import { RecordTabList, RecordTabs, type RecordSection } from "./record-tabs";
import { CatalogueEditorProvider } from "./catalogue-editor-context";
import { CatalogueContentEditor } from "./content-editor";

function FoundationEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border p-10 text-center">
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
    canManageCatalogueOperations(),
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
  // Reading a record must never be what makes it a draft, so the editor is
  // given the content it would start from - the publication, or an empty
  // record - and the draft row is created by asking to edit it.
  const { draft, hasDraft, hasChanges } = await loadCatalogueEditorState(
    record.recordId,
  );
  const [studentContent, studentCourse] = await Promise.all([
    record.publishedVersionId
      ? loadVersionWrite(record.publishedVersionId)
      : null,
    record.publishedVersionId && kind === "course"
      ? loadVersionCoursePreview(record.publishedVersionId)
      : null,
  ]);
  const hasUnpublishedChanges = Boolean(
    hasChanges &&
    (!studentContent ||
      draft.contentHash !== contentHashForCatalogueContent(studentContent)),
  );
  const draftPreview = {
    course: kind === "course" ? courseDetailsFromWrite(draft.content) : null,
    content: kind === "course" ? null : draft.content,
  };
  const publishedPreview = studentContent
    ? { course: studentCourse, content: studentCourse ? null : studentContent }
    : null;
  const [review, notes] = await Promise.all([
    loadSourceReview(record.recordId, draft.content),
    record.latestSourceVersionId
      ? loadVersionReviewNotes(record.latestSourceVersionId).then(
          summariseReviewNotes,
        )
      : null,
  ]);
  const unpublished = hasChanges
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
  // A first reading counts while it is unsure; what was read plainly waits
  // folded away and does not ask for attention.
  const openChanges =
    (review?.conflicts.length ?? 0) +
    (review?.incoming.length ?? 0) +
    (review?.firstRead.filter(
      (change) => change.band !== "accepted" && !isCertainFirstRead(change),
    ).length ?? 0);

  return (
    <RecordTabs value={section} path={path}>
      <AppShell
        admin
        breadcrumbSegmentLabels={{
          [labels.segment]: labels.plural,
          // The code names the record on every tab, and the open tab follows it.
          [encodeURIComponent(record.code.toLowerCase())]: record.code,
        }}
        tabs={<RecordTabList changeCount={openChanges} />}
      >
        <CatalogueEditorProvider
          key={`${draft.contentHash}:${draft.revision}:${record.publishedVersionId ?? "unpublished"}`}
          initial={draft.content}
          recordId={record.recordId}
          initialRevision={draft.revision}
          initiallyPublished={record.publishedVersionId !== null}
          initialHasDraft={hasDraft}
          initialHasUnpublishedChanges={hasUnpublishedChanges}
          path={path}
        >
          <div className="flex w-full min-w-0 flex-1 flex-col gap-6">
            {/* The record's summary belongs with its content; the other
                tabs lead with what they are for. */}
            {section === "content" ? (
              <RecordHeader
                record={record}
                hasDraft={hasDraft}
                hasUnpublishedChanges={hasUnpublishedChanges}
                canSync={canManageImports}
                canWrite={canWrite}
                openChangeCount={openChanges}
                conflictCount={review?.conflicts.length ?? 0}
              />
            ) : null}
            <TabsContent value="content" className="mt-0 flex flex-col">
              {canWrite ? (
                <CatalogueContentEditor />
              ) : (
                <FoundationEmpty
                  title={`${labels.singular} content is read-only`}
                  description={`You need catalogue write permission to author this ${labels.singular.toLowerCase()}. Student view shows what it currently says.`}
                />
              )}
            </TabsContent>
            <TabsContent value="student-view" className="mt-0 flex flex-col">
              <StudentViewPanel
                draft={draftPreview}
                kindLabel={labels.singular.toLowerCase()}
                published={publishedPreview}
              />
            </TabsContent>
            <TabsContent value="changes" className="mt-0 flex flex-col">
              <CatalogueChangesPanel
                canWrite={canWrite}
                hasEverSynced={record.syncs.length > 0}
                isPublished={record.publishedVersionId !== null}
                kindLabel={labels.singular.toLowerCase()}
                notes={notes}
                path={path}
                recordId={record.recordId}
                review={review}
                allFields={classifyFirstRead(draft.content)}
                subject={
                  kind === "course" ? { code: record.code, academicYear } : null
                }
                unpublished={unpublished}
              />
            </TabsContent>
            <TabsContent value="changelog" className="mt-0 flex flex-col">
              <ChangelogTimeline
                changelog={changelog}
                path={path}
                syncsHref={
                  canManageImports
                    ? `${ADMIN_CATALOGUE_OPERATIONS_PATH}?q=${encodeURIComponent(record.code)}`
                    : null
                }
                versionOrdinals={versionOrdinals}
              />
            </TabsContent>
          </div>
        </CatalogueEditorProvider>
      </AppShell>
    </RecordTabs>
  );
}
