import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  canManageCatalogueOperations,
  canWriteCatalogue,
} from "@/lib/auth/viewer";
import { diffSnapshotWrites } from "@/lib/catalogue-import/changes";
import { loadCatalogueDraft } from "@/lib/catalogue/drafts";
import {
  loadCatalogueRecord,
  loadVersionCoursePreview,
  loadVersionWrite,
} from "@/lib/coursemap/admin-catalogue-record";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
  adminCatalogueRecordPath,
  fieldLabel,
} from "@/lib/coursemap/catalogue-kinds";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { AppShell } from "@/ui/shell";
import { FieldChangeList } from "../field-change-list";
import { CoursePreview, StructurePreview } from "../version-preview";
import { RestoreVersionButton } from "./restore-version-button";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "long" }).format(
    new Date(value),
  );
}

/**
 * One immutable version, as content rather than as a database row. Comparison
 * targets are addressed in the URL so a specific comparison can be linked to.
 */
export async function CatalogueVersionPage({
  kind,
  code,
  academicYear,
  versionOrdinal,
  compare,
}: {
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  versionOrdinal: number;
  compare: string | null;
}) {
  const [canManageImports, canWrite] = await Promise.all([
    canManageCatalogueOperations(),
    canWriteCatalogue(),
  ]);
  if (!canManageImports && !canWrite) return <AccessDeniedError />;
  const record = await loadCatalogueRecord({ kind, code, academicYear });
  if (!record) notFound();

  const ordered = [...record.versions].sort(
    (left, right) => left.id - right.id,
  );
  const version = ordered[versionOrdinal - 1];
  if (!version) notFound();
  const labels = CATALOGUE_KIND_LABELS[kind];
  const path = adminCatalogueRecordPath(kind, academicYear, record.code);
  const changelogPath = `${path}/changelog`;
  const versionPath = `${changelogPath}/${versionOrdinal}`;

  const publication = record.publications.find(
    (entry) => entry.versionId === version.id,
  );
  const [content, coursePreview, draft] = await Promise.all([
    loadVersionWrite(version.id),
    kind === "course" ? loadVersionCoursePreview(version.id) : null,
    loadCatalogueDraft(record.recordId),
  ]);
  if (!content) notFound();

  const comparisons = [
    ...(draft ? [{ key: "draft", label: "Current draft" }] : []),
    ...(record.publishedVersionId
      ? [{ key: "published", label: "Published" }]
      : []),
    ...(versionOrdinal > 1
      ? [
          {
            key: String(versionOrdinal - 1),
            label: `Version ${versionOrdinal - 1}`,
          },
        ]
      : []),
  ].filter((option) => option.key !== String(versionOrdinal));

  const comparedTo =
    compare && comparisons.some((option) => option.key === compare)
      ? compare
      : null;
  const comparedVersionId =
    comparedTo === null || comparedTo === "draft"
      ? null
      : comparedTo === "published"
        ? record.publishedVersionId
        : (ordered[Number(comparedTo) - 1]?.id ?? null);
  const comparedContent =
    comparedTo === "draft"
      ? (draft?.content ?? null)
      : comparedVersionId
        ? await loadVersionWrite(comparedVersionId)
        : null;
  const differences = comparedContent
    ? diffSnapshotWrites(content, comparedContent)
    : [];

  return (
    <AppShell
      admin
      currentBreadcrumbLabel={`Version ${versionOrdinal}`}
      breadcrumbSegmentLabels={{
        [labels.segment]: labels.plural,
        [String(academicYear)]: String(academicYear),
        changelog: "Changelog",
      }}
    >
      <div className="flex w-full min-w-0 flex-col gap-6">
        <Link
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
          href={changelogPath}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to the changelog
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Version {versionOrdinal}
              </h1>
              <Badge variant="outline">
                {version.origin === "source" ? "From ANU" : "Authored"}
              </Badge>
              {record.publishedVersionId === version.id ? (
                <Badge variant="success-light">Published now</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {publication
                ? `Published ${formatDate(publication.publishedAt)}`
                : `Created ${formatDate(version.createdAt)}`}
              {publication?.unpublishedAt
                ? ` · Unpublished ${formatDate(publication.unpublishedAt)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {comparedTo ? (
              <Button asChild variant="outline">
                <Link href={versionPath}>Student view</Link>
              </Button>
            ) : comparisons.length > 0 ? (
              <Button asChild variant="outline">
                <Link href={`${versionPath}?compare=${comparisons[0]!.key}`}>
                  Compare
                </Link>
              </Button>
            ) : null}
            {canWrite ? (
              <RestoreVersionButton
                draftRevision={draft?.revision ?? null}
                path={path}
                recordId={record.recordId}
                versionId={version.id}
              />
            ) : null}
          </div>
        </header>

        {comparedTo ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide uppercase">
                Compared with
              </h2>
              {comparisons.map((option) => (
                <Button
                  asChild
                  key={option.key}
                  size="sm"
                  variant={option.key === comparedTo ? "default" : "outline"}
                >
                  <Link href={`${versionPath}?compare=${option.key}`}>
                    {option.label}
                  </Link>
                </Button>
              ))}
            </div>
            {differences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                These two are identical.
              </p>
            ) : (
              <FieldChangeList
                changes={differences.map((difference) => ({
                  fieldPath: difference.fieldPath,
                  label: fieldLabel(difference.fieldPath),
                  oldValue: difference.oldValue,
                  newValue: difference.newValue,
                }))}
              />
            )}
          </section>
        ) : coursePreview ? (
          <CoursePreview course={coursePreview} />
        ) : (
          <StructurePreview write={content} />
        )}
      </div>
    </AppShell>
  );
}
