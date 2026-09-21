import { TabsContent } from "@coursemap/ui/primitives/tabs";
import { ClipboardCheck, Eye, History, SquarePen } from "lucide-react";
import Link from "next/link";
import { canManageCourseImports } from "@/lib/auth/viewer";
import {
  loadCatalogueRecord,
  loadSnapshotCoursePreview,
  loadSnapshotWrite,
} from "@/lib/coursemap/admin-catalogue-record";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
  adminCataloguePath,
} from "@/lib/coursemap/catalogue-kinds";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { AppShell } from "@/ui/shell";
import { SectionTabs } from "@/ui/common/section-tabs";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { anuSourceUrl } from "./anu-source";
import { RecordHeader } from "./record-header";
import { RecordTabs } from "./record-tabs";
import { RecordHistory } from "./record-history";
import { ReviewPanel } from "./review-panel";
import { VersionEditor } from "./version-editor";
import { CoursePreview, StructurePreview } from "./version-preview";
import type { SearchParams } from "./catalogue-pages";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** One catalogue record for one year: review, history and (later) preview and editing. */
export async function CatalogueRecordPage({
  kind,
  code,
  searchParams,
}: {
  kind: CatalogueKind;
  code: string;
  searchParams: SearchParams;
}) {
  if (!(await canManageCourseImports())) return <AccessDeniedError />;
  const params = await searchParams;
  const academicYear = Number(first(params.year));
  const labels = CATALOGUE_KIND_LABELS[kind];
  const basePath = adminCataloguePath(kind);
  const upperCode = code.toUpperCase();
  const record = Number.isInteger(academicYear)
    ? await loadCatalogueRecord({ kind, code: upperCode, academicYear })
    : null;
  const path = `${basePath}/${upperCode}?year=${academicYear}`;
  const requestedTab = first(params.tab);
  const tab = ["review", "preview", "edit", "history"].includes(
    requestedTab ?? "",
  )
    ? (requestedTab as "review" | "preview" | "edit" | "history")
    : "review";
  const currentSnapshotId = record
    ? (record.currentVersionId ?? record.publishedVersionId)
    : null;
  const [write, coursePreview] = currentSnapshotId
    ? await Promise.all([
        loadSnapshotWrite(currentSnapshotId),
        record?.kind === "course"
          ? loadSnapshotCoursePreview(currentSnapshotId)
          : Promise.resolve(null),
      ])
    : [null, null];

  // Each tab carries an icon rather than a count. A badge on Review reported
  // the open flags a second time, under a label that already says what the
  // tab is for, and it moved the tab's width every time one was resolved.
  const sectionTabs = record ? (
    <SectionTabs
      label="Record sections"
      tabs={[
        {
          value: "review",
          label: "Review",
          icon: <ClipboardCheck aria-hidden="true" size={16} />,
        },
        {
          value: "preview",
          label: "Preview",
          disabled: !currentSnapshotId,
          icon: <Eye aria-hidden="true" size={16} />,
        },
        {
          value: "edit",
          label: "Edit",
          disabled: !currentSnapshotId || Boolean(record.archivedAt),
          icon: <SquarePen aria-hidden="true" size={16} />,
        },
        {
          value: "history",
          label: "History",
          icon: <History aria-hidden="true" size={16} />,
        },
      ]}
    />
  ) : null;

  return (
    <RecordTabs value={tab} path={path}>
      <AppShell
        admin
        currentBreadcrumbLabel={upperCode}
        breadcrumbSegmentLabels={{ [labels.segment]: labels.plural }}
        tabs={sectionTabs}
      >
        {!record ? (
          <CatalogueEmpty
            title={`${upperCode} has no ${academicYear || ""} record`}
            description={`Import ${upperCode} from the ${labels.singular.toLowerCase()} directory to create one.`}
          >
            <Link
              className="text-sm underline underline-offset-4"
              href={basePath}
            >
              Back to {labels.plural.toLowerCase()}
            </Link>
          </CatalogueEmpty>
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-5">
            <RecordHeader record={record} path={path} />
            <TabsContent value="review" className="mt-4 flex flex-col gap-4">
              {record.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No imports have run for this record. Start one from the
                  directory.
                </p>
              ) : (
                record.reviews.map((review) => (
                  <ReviewPanel
                    key={review.id}
                    review={review}
                    path={path}
                    sourceHref={anuSourceUrl(record)}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="preview" className="mt-4">
              {record.currentVersionId ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  Showing the draft. Students see the published version until
                  the draft is published.
                </p>
              ) : null}
              {coursePreview ? (
                <CoursePreview course={coursePreview} />
              ) : write ? (
                <StructurePreview write={write} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing to preview yet.
                </p>
              )}
            </TabsContent>
            <TabsContent value="edit" className="mt-4">
              {write && currentSnapshotId ? (
                <VersionEditor
                  key={currentSnapshotId}
                  initial={write}
                  recordId={record.recordId}
                  baseSnapshotId={currentSnapshotId}
                  path={path}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Import the record before editing it.
                </p>
              )}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <RecordHistory record={record} path={path} />
            </TabsContent>
          </div>
        )}
      </AppShell>
    </RecordTabs>
  );
}

/**
 * Reviews arrive newest first. Only the latest is a live decision, so it is the
 * one on screen; the rest stay behind a disclosure rather than stacking five
 * 400px cards of settled history under it.
 */
