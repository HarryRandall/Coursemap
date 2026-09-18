import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
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
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { RecordHeader } from "./record-header";
import { RecordHistory } from "./record-history";
import { ReviewPanel } from "./review-panel";
import { SnapshotEditor } from "./snapshot-editor";
import { CoursePreview, StructurePreview } from "./snapshot-preview";
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
    ? (record.draftSnapshotId ?? record.publishedSnapshotId)
    : null;
  const [write, coursePreview] = currentSnapshotId
    ? await Promise.all([
        loadSnapshotWrite(currentSnapshotId),
        record?.kind === "course"
          ? loadSnapshotCoursePreview(currentSnapshotId)
          : Promise.resolve(null),
      ])
    : [null, null];

  return (
    <AppShell
      admin
      currentBreadcrumbLabel={upperCode}
      breadcrumbSegmentLabels={{ [labels.segment]: labels.plural }}
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
        <div className="mx-auto flex w-full min-w-0 flex-col gap-5">
          <RecordHeader record={record} path={path} />
          <Tabs defaultValue={tab} className="block">
            <TabsList aria-label="Record sections" variant="line">
              <TabsTrigger value="review">
                Review
                {record.reviews.some((review) =>
                  review.entries.some((entry) => entry.status === "open"),
                ) ? (
                  <span
                    className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500"
                    aria-label="open items"
                  />
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="preview" disabled={!currentSnapshotId}>
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="edit"
                disabled={!currentSnapshotId || Boolean(record.archivedAt)}
              >
                Edit
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="review" className="mt-4 flex flex-col gap-4">
              {record.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No imports have run for this record. Start one from the
                  directory.
                </p>
              ) : (
                record.reviews.map((review) => (
                  <ReviewPanel key={review.id} review={review} path={path} />
                ))
              )}
            </TabsContent>
            <TabsContent value="preview" className="mt-4">
              {record.draftSnapshotId ? (
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
                <SnapshotEditor
                  key={currentSnapshotId}
                  initial={write}
                  itemYearId={record.itemYearId}
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
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}
