"use client";

import {
  CatalogueReviewHistory,
  type CatalogueReviewEvent,
} from "@/ui/admin/imports/catalogue-review-history";
import { RestoreCatalogueVersion } from "@/ui/admin/imports/restore-catalogue-version";
import {
  useCatalogueApproval,
  SectionApproval,
  BulkSectionApproval,
} from "@/ui/admin/imports/catalogue-section-approval";
import type { CatalogueSectionReview } from "@/lib/coursemap/catalogue-section-review";
import {
  catalogueWorkspacePath,
  catalogueWorkspaceView,
} from "@/lib/coursemap/catalogue-workspace-routes";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import { Tabs, TabsContent } from "@coursemap/ui/primitives/tabs";
import { CourseReviewTabs } from "@/ui/admin/imports/course-review-tabs";
import { AppShell } from "@/ui/shell";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { OptionPicker } from "@/ui/common/option-picker";
import { CourseDataSections } from "@/ui/admin/courses/course-data-sections";
import {
  CourseReviewSidebar,
  reviewSectionKeys,
} from "@/ui/admin/courses/course-review-sidebar";
import { CourseImportButton } from "@/ui/admin/courses/course-import-button";
import { CourseImportEmpty } from "@/ui/admin/courses/course-import-empty";
import { CourseImportHistory } from "@/ui/admin/courses/course-import-history";
import { RequisitePanel } from "@/ui/admin/courses/course-requisites-section";
import { CourseImportAutoRefresh } from "@/ui/admin/imports/course-import-auto-refresh";
import { PendingImportProposals } from "@/ui/admin/imports/pending-import-proposals";
import {
  CourseDetailTabsList,
  CourseDetailView,
} from "@/ui/courses/course-detail-view";
import {
  CourseSnapshotRuleViewer,
  type EditableRuleKind,
} from "@/ui/admin/requisites/course-snapshot-rule-editor";
import { courseReviewIssueSection } from "@/lib/coursemap/course-review-sections";
import { adminCourseDetailPath } from "@/lib/coursemap/course-routes";
import {
  archiveCourseYear,
  publishCourseSnapshot,
  saveCourseSnapshot,
} from "@/lib/coursemap/course-snapshot-actions";
import type { AdminCourseYearRecord } from "@/lib/coursemap/admin-course-year";
import type { CourseImportTargetDetail } from "@/lib/coursemap/admin-course-imports";
import type { CourseWorkspaceEntry } from "@/lib/coursemap/course-workspace-entry";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
import styles from "@/ui/admin/courses/course-workspace.module.css";

const ruleKinds = [
  "prerequisite",
  "corequisite",
  "permission",
  "assumed_knowledge",
  "incompatibility",
] as const;

export function CourseReview({
  canWrite,
  canReviewImports,
  canImport,
  previewCourse,
  record,
  entry,
  importDetail,
  sectionReviews = [],
  reviewHistory = [],
}: {
  canWrite: boolean;
  canReviewImports: boolean;
  sectionReviews?: CatalogueSectionReview;
  reviewHistory?: CatalogueReviewEvent[];
  canImport: boolean;
  previewCourse: CourseDetails | null;
  record: AdminCourseYearRecord | null;
  entry: CourseWorkspaceEntry;
  importDetail: CourseImportTargetDetail | null;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const pathname = usePathname();
  const selectedView = catalogueWorkspaceView(
    pathname,
    new URLSearchParams(query.toString()),
  );
  const requestedView = selectedView === "review" ? "overview" : selectedView;
  const active = [...reviewSectionKeys, "history", "preview"].includes(
    requestedView,
  )
    ? requestedView
    : "overview";
  const actionRef = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<"publish" | "archive" | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingRule, setEditingRule] = useState<EditableRuleKind | null>(null);
  const [newKind, setNewKind] = useState<EditableRuleKind>("prerequisite");
  const [pending, setPending] = useState(false);
  const [compare, setCompare] = useState(false);
  const approval = useCatalogueApproval({
    kind: "course",
    yearId: record?.courseYearId ?? 0,
    snapshotId: record?.currentSnapshotId ?? 0,
    sections: sectionReviews,
  });
  const projection = record?.projection ?? null;
  const currentId = record?.currentSnapshotId ?? null;
  const savedBase = useRef<number | null>(null);
  const pendingCandidate =
    record?.pendingImports.some(
      (proposal) => proposal.candidateSnapshotId === currentId,
    ) ?? false;
  const historical =
    pathname.includes("/versions/") ||
    (!!record &&
      currentId !== null &&
      currentId !== record.activeSnapshotId &&
      !pendingCandidate);
  const isDraft =
    !!record && currentId !== null && currentId === record.draftSnapshotId;
  const published =
    !!record && currentId !== null && currentId === record.publishedSnapshotId;
  const canEdit =
    canWrite &&
    record?.lifecycleStatus === "active" &&
    !historical &&
    (isDraft || published) &&
    !!projection;
  const busy = editing || editingRule !== null || pending || approval.pending;
  const needsReview =
    !!record &&
    (!!record.snapshot?.has_critical_uncertainty ||
      record.blockingReviewItems.length > 0);
  const reviewing = !!projection && isDraft && !historical;
  const checkedSections = approval.sections
    .filter((section) => section.approved)
    .map((section) => section.key);
  const activeImport = entry.imports.some((item) =>
    ["queued", "processing"].includes(item.processing_status),
  );
  const issues =
    record?.blockingReviewItems.filter(
      (item) =>
        item.issue_code !== "MANUAL_REVIEW_REQUIRED" &&
        courseReviewIssueSection(item.field_path) === active,
    ) ?? [];
  const canPublish =
    canEdit &&
    isDraft &&
    !needsReview &&
    approval.complete &&
    record?.snapshot?.sealed_at != null &&
    !published;
  const availableKinds = ruleKinds.filter(
    (kind) => !projection?.rules.some((rule) => rule.ruleKind === kind),
  );
  const selectedNewKind = availableKinds.includes(newKind)
    ? newKind
    : availableKinds[0];

  function select(view: string) {
    const params = new URLSearchParams(query.toString());
    if (view === "history") params.delete("import");
    const destination = catalogueWorkspacePath(
      pathname,
      view,
      params.toString(),
    );
    if (
      reviewSectionKeys.includes(active) &&
      reviewSectionKeys.includes(view)
    ) {
      window.history.replaceState(null, "", destination);
    } else {
      router.replace(destination, { scroll: false });
    }
  }
  function snapshot(id: number) {
    if (!record) return;
    setCompare(false);
    savedBase.current = null;
    const base = adminCourseDetailPath({
      publicId: record.publicId,
    });
    const versionId = record.snapshotHistory.find(
      (version) => version.id === id,
    )?.publicId;
    if (id !== record.activeSnapshotId && !versionId) return;
    router.push(
      id === record.activeSnapshotId ? base : `${base}/versions/${versionId}`,
      { scroll: false },
    );
  }

  async function save(proposed: CourseSnapshotProjectionData) {
    if (!record || currentId === null) return;
    setPending(true);
    try {
      const result = await saveCourseSnapshot({
        coursePublicId: record.publicId,
        courseYearId: record.courseYearId,
        expectedBaseSnapshotId: savedBase.current ?? currentId,
        projection: proposed,
      });
      if (!result.ok) throw new Error(result.message);
      savedBase.current = result.snapshotId ?? currentId;
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  async function submit(action: "publish" | "archive") {
    if (!record || currentId === null || !projection) return;
    setPending(true);
    try {
      const result =
        action === "publish"
          ? await publishCourseSnapshot({
              code: entry.code,
              year: entry.year,
              coursePublicId: record.publicId,
              courseYearId: record.courseYearId,
              snapshotId: currentId,
              expectedPublishedSnapshotId: record.publishedSnapshotId,
            })
          : await archiveCourseYear({
              code: entry.code,
              year: entry.year,
              coursePublicId: record.publicId,
              courseYearId: record.courseYearId,
              expectedDraftSnapshotId: record.draftSnapshotId,
              expectedPublishedSnapshotId: record.publishedSnapshotId,
            });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  const hasContent = !!projection || entry.imports.length > 0;
  const displayedView =
    !projection && (!hasContent || active !== "history") ? "empty" : active;
  const topView = reviewSectionKeys.includes(active) ? "review" : active;
  return (
    <Tabs
      value={topView}
      onValueChange={(view) => select(view === "review" ? "overview" : view)}
      className="block"
    >
      <AppShell
        admin
        fullBleed
        fill
        breadcrumbSegmentLabels={{
          [record?.publicId ?? entry.publicId ?? entry.code]:
            `${entry.code} · ${entry.year}`,
          [String(entry.year)]: entry.code,
          versions: null,
        }}
        currentBreadcrumbLabel={
          historical
            ? "Version"
            : topView === "history"
              ? "History"
              : topView === "preview"
                ? "Preview"
                : `${entry.code} · ${entry.year}`
        }
        tabs={
          hasContent ? (
            <CourseReviewTabs
              activeTab={topView}
              hasData={!!projection}
              editing={busy}
            />
          ) : undefined
        }
      >
        <CourseImportAutoRefresh active={activeImport} />
        {topView === "review" && (historical || canPublish) ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
            {historical &&
            canWrite &&
            record?.snapshot?.public_id &&
            record.activeSnapshotId ? (
              <RestoreCatalogueVersion
                kind="course"
                yearId={record.courseYearId}
                versionId={record.snapshot.public_id}
                expectedSnapshotId={record.activeSnapshotId}
                workspaceHref={catalogueWorkspacePath(pathname)}
              />
            ) : null}
            {historical ? (
              <Badge variant="outline">Previous version · Read only</Badge>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {historical && record?.activeSnapshotId ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => snapshot(record.activeSnapshotId!)}
                >
                  Back to current version
                </Button>
              ) : null}
              {canPublish ? (
                <Button
                  ref={actionRef}
                  size="sm"
                  disabled={busy}
                  onClick={() => setDialog("publish")}
                >
                  Publish
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <TabsContent value={topView} className={`${styles.layout} mt-0`}>
          {topView === "review" && projection ? (
            <CourseReviewSidebar
              active={displayedView}
              onSelect={select}
              disabled={editing || editingRule !== null || pending}
              checked={checkedSections}
              flagged={approval.sections
                .filter((section) => !section.approved && !section.eligible)
                .map((section) => section.key)}
              reviewing={reviewing}
              hasData={!!projection}
            />
          ) : null}
          <div
            className={`${styles.content} ${displayedView === "empty" ? styles.emptyContent : ""}`}
            key={active}
            role="region"
            aria-label="Course workspace"
            tabIndex={0}
          >
            {displayedView === "empty" ? (
              <CourseImportEmpty
                code={entry.code}
                year={entry.year}
                canImport={canImport}
                active={activeImport}
                hasImports={entry.imports.length > 0}
                onStarted={() => select("history")}
              />
            ) : null}
            {record && projection && reviewSectionKeys.includes(active) ? (
              <div className="space-y-4">
                {reviewing ? (
                  <div className="space-y-3">
                    <BulkSectionApproval
                      sections={approval.sections}
                      disabled={!canEdit || busy}
                      onApprove={(keys, bulk) =>
                        void approval.approve(keys, true, bulk)
                      }
                    />
                    <SectionApproval
                      section={approval.sections.find(
                        (section) => section.key === active,
                      )}
                      disabled={!canEdit || busy}
                      onApprove={(value) => {
                        void approval.approve([active], value);
                        const next =
                          reviewSectionKeys[
                            reviewSectionKeys.indexOf(active) + 1
                          ];
                        if (value && next) select(next);
                      }}
                    />
                  </div>
                ) : null}
                {issues.length > 0 && reviewing ? (
                  <details
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5"
                    open
                  >
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      {issues.length} source{" "}
                      {issues.length === 1 ? "issue" : "issues"} to check
                    </summary>
                    <div className="space-y-3 px-4 pb-4">
                      {issues.map((item) => (
                        <div key={item.id}>
                          <p className="text-sm">{item.summary}</p>
                          {item.source_excerpt ? (
                            <blockquote className="mt-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                              {item.source_excerpt}
                            </blockquote>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {record.publishedProjection && isDraft && !published ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      disabled={busy}
                      checked={compare}
                      onCheckedChange={(value) => setCompare(value === true)}
                    />
                    Compare with published version
                  </label>
                ) : null}
                {active !== "requisites" ? (
                  <CourseDataSections
                    key={active}
                    sectionKey={active}
                    compare={compare}
                    canEdit={!!canEdit}
                    onSave={save}
                    onEditingChange={setEditing}
                    record={record}
                  />
                ) : (
                  <div className="space-y-4">
                    {compare && record.publishedProjection ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {(
                          [
                            ["Published", record.publishedProjection],
                            ["Draft", projection],
                          ] as const
                        ).map(([label, version]) => (
                          <section
                            key={label}
                            aria-label={`${label} requisites`}
                            className="rounded-lg border border-border p-4"
                          >
                            <h2 className="mb-3 text-sm font-semibold">
                              {label}
                            </h2>
                            {version.rules.length ? (
                              ruleKinds
                                .filter((kind) =>
                                  version.rules.some(
                                    (rule) => rule.ruleKind === kind,
                                  ),
                                )
                                .map((kind) => (
                                  <div key={kind} className="mb-4">
                                    <h3 className="text-sm font-medium capitalize">
                                      {kind.replaceAll("_", " ")}
                                    </h3>
                                    <CourseSnapshotRuleViewer
                                      kind={kind}
                                      projection={version}
                                    />
                                  </div>
                                ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No requisites recorded.
                              </p>
                            )}
                          </section>
                        ))}
                      </div>
                    ) : null}
                    {ruleKinds
                      .filter(
                        (kind) =>
                          projection.rules.some(
                            (rule) => rule.ruleKind === kind,
                          ) || editingRule === kind,
                      )
                      .map((kind) => (
                        <RequisitePanel
                          key={kind}
                          kind={kind}
                          canEdit={!!canEdit && !pending}
                          editing={editingRule === kind}
                          onEdit={() => setEditingRule(kind)}
                          onCancelEdit={() => setEditingRule(null)}
                          onSave={save}
                          projection={projection}
                          originalSourceTexts={
                            record.sourceOriginalProjection?.rules
                              .filter((rule) => rule.ruleKind === kind)
                              .map((rule) => rule.sourceText) ?? []
                          }
                        />
                      ))}
                    {!projection.rules.length && !editingRule ? (
                      <p className="py-6 text-sm text-muted-foreground">
                        No requisites recorded.
                      </p>
                    ) : null}
                    {canEdit && !editingRule && selectedNewKind ? (
                      <div className="flex flex-wrap gap-3">
                        <OptionPicker
                          aria-label="Requisite type"
                          value={selectedNewKind}
                          items={availableKinds.map((kind) => ({
                            value: kind,
                            label: kind.replaceAll("_", " "),
                          }))}
                          onValueChange={(value) =>
                            setNewKind(value as EditableRuleKind)
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={() => setEditingRule(selectedNewKind)}
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          Add requisite
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                {reviewing ? (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        select(
                          reviewSectionKeys[
                            (reviewSectionKeys.indexOf(active) + 1) %
                              reviewSectionKeys.length
                          ]!,
                        )
                      }
                    >
                      Next section
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {active === "history" ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-lg font-semibold">History</h1>
                  {entry.imports.length || projection ? (
                    <CourseImportButton
                      code={entry.code}
                      year={entry.year}
                      disabled={
                        !canImport ||
                        activeImport ||
                        record?.lifecycleStatus === "archived"
                      }
                      label={activeImport ? "Import in progress" : "Re-import"}
                      onStarted={() => select("history")}
                    />
                  ) : null}
                </div>
                <CatalogueReviewHistory
                  events={reviewHistory}
                  workspaceHref={catalogueWorkspacePath(pathname)}
                />
                {!projection && !entry.imports.length ? (
                  <CourseImportEmpty
                    code={entry.code}
                    year={entry.year}
                    canImport={canImport}
                    onStarted={() => select("history")}
                  />
                ) : null}
                {record && canReviewImports ? (
                  <PendingImportProposals
                    pendingImports={record.pendingImports.filter(
                      (proposal) =>
                        proposal.targetId === importDetail?.target.id &&
                        proposal.candidateSnapshotId !==
                          record.draftSnapshotId &&
                        !proposal.isCurrentDraftSource,
                    )}
                    currentDraftSnapshotId={record.draftSnapshotId}
                  />
                ) : null}
                {entry.imports.length || record?.snapshotHistory.length ? (
                  <CourseImportHistory
                    imports={entry.imports}
                    versions={record?.snapshotHistory ?? []}
                    publishedSnapshotId={record?.publishedSnapshotId ?? null}
                    draftSnapshotId={record?.draftSnapshotId ?? null}
                    detail={importDetail}
                    onInspectSnapshot={snapshot}
                  />
                ) : null}
              </div>
            ) : null}
            {active === "preview" && previewCourse ? (
              <Tabs defaultValue="overview" className="gap-5">
                <div className="overflow-x-auto border-b border-border">
                  <CourseDetailTabsList />
                </div>
                <CourseDetailView
                  course={previewCourse}
                  requisiteCompletion={{
                    completedCourses: [],
                    isAuthenticated: false,
                  }}
                />
              </Tabs>
            ) : null}
          </div>
        </TabsContent>
        <ConfirmDialog
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          returnFocusRef={actionRef}
          title={
            dialog === "publish"
              ? `Publish ${entry.code} ${entry.year}?`
              : `Archive ${entry.code} ${entry.year}?`
          }
          description={
            dialog === "publish"
              ? "This draft will become the student-facing course for this year."
              : "Hide this course year from students and retain its history."
          }
          confirmLabel={
            dialog === "publish" ? "Publish" : "Archive course year"
          }
          destructive={dialog === "archive"}
          onConfirm={() => (dialog ? submit(dialog) : undefined)}
        />
      </AppShell>
    </Tabs>
  );
}
