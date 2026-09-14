"use client";
import { PendingImportProposals } from "@/ui/admin/imports/pending-import-proposals";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";

import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { CheckCircle2, CircleAlert, Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { publishStructureSnapshot } from "@/lib/coursemap/catalogue-publication-actions";
import type { AdminStructureReviewRecord } from "@/lib/coursemap/admin-catalogue";
import { AppShell } from "@/ui/shell";
import { StructureRequirementDiagram } from "@/ui/admin/academic-structures/requirement-diagram";
import { SectionNavigation } from "@/ui/common/section-navigation";
import { CatalogueImportButton } from "@/ui/admin/imports/catalogue-import-button";
import { CourseImportAutoRefresh } from "@/ui/admin/imports/course-import-auto-refresh";
import { StructureImportHistory } from "@/ui/admin/academic-structures/structure-import-history";
import type { StructureWorkspaceEntry } from "@/lib/coursemap/structure-workspace-entry";
import type { AcademicStructureImportTargetDetail } from "@/lib/coursemap/admin-academic-structure-imports";
import {
  AcademicStructureManualSnapshotEditor,
  type StructureEditorSection,
} from "@/ui/admin/academic-structures/manual-snapshot-editor";
import { GroupCard } from "@/ui/admin/academic-structures/structure-requirement-group-card";
import { SourceText } from "@/ui/admin/academic-structures/structure-review-fields";
import {
  StructureSectionContent,
  detailSections,
} from "@/ui/admin/academic-structures/structure-section-content";

import { StructurePlanningDiagnostics } from "@/ui/admin/academic-structures/structure-planning-diagnostics";

export function ProgrammeReview({
  canEdit: canWrite,
  canPublish,
  canReviewImports,
  record,
  entry,
  importDetail,
  canImport,
  sectionReviews = [],
  reviewHistory = [],
}: {
  canEdit: boolean;
  canPublish: boolean;
  canReviewImports: boolean;
  record: AdminStructureReviewRecord;
  entry: StructureWorkspaceEntry;
  importDetail: AcademicStructureImportTargetDetail | null;
  sectionReviews?: CatalogueSectionReview;
  reviewHistory?: CatalogueReviewEvent[];
  canImport: boolean;
}) {
  const router = useRouter();
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<StructureEditorSection | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "danger";
  } | null>(null);
  const query = useSearchParams();
  const pathname = usePathname();
  const requestedTab = catalogueWorkspaceView(
    pathname,
    new URLSearchParams(query.toString()),
  );
  const tab = ["requirements", "preview", "history"].includes(requestedTab)
    ? requestedTab
    : "details";
  const topView = tab === "history" || tab === "preview" ? tab : "review";
  const activeImport = entry.imports.some((item) =>
    ["queued", "running", "processing"].includes(item.processing_status),
  );
  function setTab(value: string) {
    const params = new URLSearchParams(query.toString());
    if (value === "history") params.delete("import");
    const destination = catalogueWorkspacePath(
      pathname,
      value,
      params.toString(),
    );
    if (
      ["details", "requirements"].includes(tab) &&
      ["details", "requirements"].includes(value)
    ) {
      window.history.replaceState(null, "", destination);
    } else {
      router.replace(destination, { scroll: false });
    }
  }
  const [requirementView, setRequirementView] = useState("builder");
  const diagramOpen =
    tab === "requirements" && requirementView === "diagram" && editing === null;
  const contained = tab === "preview" || tab === "history" || diagramOpen;
  const isDraft = record.draftSnapshotId === record.id;
  const isPublished = record.publishedSnapshotId === record.id;
  const historical = pathname.includes("/versions/");
  const canEdit = canWrite && !historical && (isDraft || isPublished);
  const approval = useCatalogueApproval({
    kind: record.kind,
    yearId: record.structureYearId,
    snapshotId: record.id,
    sections: sectionReviews,
  });
  const needsReview = record.reviewState !== "verified" || !approval.complete;

  async function publish() {
    setPublishing(true);
    setMessage(null);
    const result = await publishStructureSnapshot(
      record.structureYearId,
      record.id,
      record.code,
      record.kind,
      record.publicId,
    );
    setPublishing(false);
    setMessage({
      text: result.message,
      tone: result.ok ? "success" : "danger",
    });
    if (result.ok) router.refresh();
  }
  function editor(section: StructureEditorSection) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <SourceText record={record} section={section} />
        </div>
        <AcademicStructureManualSnapshotEditor
          key={section}
          section={section}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage({ text: "Changes saved.", tone: "success" });
          }}
          record={record}
        />
      </div>
    );
  }

  return (
    <Tabs className="block" value={topView} onValueChange={setTab}>
      <AppShell
        fill={contained}
        fullBleed={tab === "history"}
        admin
        currentBreadcrumbLabel={
          historical
            ? "Version"
            : topView === "history"
              ? "History"
              : topView === "preview"
                ? "Preview"
                : record.code
        }
        breadcrumbSegmentLabels={{
          [record.publicId]: record.code,
          [String(record.year)]: record.code,
          versions: null,
        }}
        tabs={
          <TabsList variant="line">
            {[
              { label: "Review", value: "review" },
              { label: "History", value: "history" },
              { label: "Preview", value: "preview" },
            ].map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                disabled={editing !== null && item.value !== topView}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      >
        <CourseImportAutoRefresh active={activeImport} />
        <div
          className={
            tab === "history"
              ? "min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-7"
              : contained
                ? "workspace-stack"
                : "mx-auto w-full min-w-0 space-y-5"
          }
        >
          <h1 className="sr-only">
            Review {record.code} {record.name}
          </h1>
          {historical || (!isDraft && !isPublished) ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline">Previous version · Read only</Badge>
              {canWrite &&
              (record.draftSnapshotId ?? record.publishedSnapshotId) ? (
                <RestoreCatalogueVersion
                  kind={record.kind}
                  yearId={record.structureYearId}
                  versionId={pathname.split("/").at(-1)!}
                  expectedSnapshotId={
                    (record.draftSnapshotId ?? record.publishedSnapshotId)!
                  }
                  workspaceHref={catalogueWorkspacePath(pathname)}
                />
              ) : null}
            </div>
          ) : null}
          {topView === "review" && record.reviewIssues?.length ? (
            <div className="space-y-3">
              {record.reviewIssues.map((issue) => (
                <Alert
                  key={issue.id}
                  variant={
                    issue.severity === "error" ? "destructive" : "default"
                  }
                >
                  <AlertDescription>
                    <p>{issue.message}</p>
                    {issue.source_text ? (
                      <blockquote className="mt-2 border-l-2 pl-3 text-sm">
                        {issue.source_text}
                      </blockquote>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          ) : null}
          {topView === "review" && !historical && isDraft && canPublish ? (
            <div className="mb-5 flex justify-end">
              <Button
                ref={actionTriggerRef}
                disabled={
                  needsReview ||
                  publishing ||
                  editing !== null ||
                  approval.pending
                }
                onClick={() => setPublishDialogOpen(true)}
              >
                Publish
              </Button>
              <ConfirmDialog
                open={publishDialogOpen}
                onOpenChange={setPublishDialogOpen}
                returnFocusRef={actionTriggerRef}
                title={`Publish ${record.code} ${record.year}?`}
                description={`Publish the current draft of ${record.name}. It will become the student-facing version for ${record.year}.`}
                confirmLabel="Publish"
                onConfirm={publish}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">
              {record.code}
            </span>
            <Badge variant="outline">{record.year}</Badge>
            <Badge variant={isDraft ? "primary-light" : "success-light"}>
              {isDraft
                ? "Unpublished"
                : isPublished
                  ? "Published"
                  : "Awaiting review"}
            </Badge>
            {needsReview ? (
              <Badge variant="warning-light">Needs review</Badge>
            ) : null}
          </div>
          {message ? (
            <Alert
              role="status"
              variant={message.tone === "success" ? "success" : "destructive"}
            >
              {message.tone === "success" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}
          <StructurePlanningDiagnostics
            projection={record.projection}
            compact={contained}
          />
          {topView === "review" ? (
            <nav className="flex gap-2" aria-label="Review sections">
              <Button
                variant={tab === "details" ? "secondary" : "ghost"}
                onClick={() => setTab("details")}
              >
                Details
              </Button>
              <Button
                variant={tab === "requirements" ? "secondary" : "ghost"}
                onClick={() => setTab("requirements")}
              >
                Requirements
              </Button>
            </nav>
          ) : null}
          {topView === "review" && !historical && isDraft ? (
            <BulkSectionApproval
              sections={approval.sections}
              disabled={!canEdit || editing !== null || approval.pending}
              onApprove={(keys, bulk) =>
                void approval.approve(keys, true, bulk)
              }
            />
          ) : null}
          {tab === "details" ? (
            <TabsContent className="mt-0 space-y-5" value="review">
              <SectionNavigation
                sections={detailSections.map((section) => ({
                  id: `structure-section-${section.key}`,
                  label: section.label,
                }))}
              />
              {detailSections.map(({ key, label }) =>
                editing === key ? (
                  <div
                    key={key}
                    id={`structure-section-${key}`}
                    className="scroll-mt-44"
                  >
                    {editor(key)}
                  </div>
                ) : (
                  <section
                    className="scroll-mt-44 rounded-xl border border-border bg-card"
                    id={`structure-section-${key}`}
                    key={key}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <h2 className="text-base font-semibold">{label}</h2>
                      <div className="flex gap-2">
                        {isDraft ? (
                          <SectionApproval
                            section={approval.sections.find(
                              (section) => section.key === key,
                            )}
                            disabled={
                              !canEdit || editing !== null || approval.pending
                            }
                            onApprove={(value) => {
                              void approval.approve([key], value);
                              if (!value) return;
                              const next =
                                detailSections[
                                  detailSections.findIndex(
                                    (section) => section.key === key,
                                  ) + 1
                                ];
                              if (next) {
                                document
                                  .getElementById(
                                    `structure-section-${next.key}`,
                                  )
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              } else {
                                setTab("requirements");
                              }
                            }}
                          />
                        ) : null}
                        <SourceText record={record} section={key} />
                        {canEdit ? (
                          <Button
                            disabled={editing !== null}
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(key)}
                          >
                            <Pencil aria-hidden="true" size={14} />
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="border-t border-border/60 px-5 py-4 sm:px-6">
                      <StructureSectionContent record={record} section={key} />
                    </div>
                  </section>
                ),
              )}
            </TabsContent>
          ) : null}
          {tab === "requirements" && isDraft ? (
            <SectionApproval
              section={approval.sections.find(
                (section) => section.key === "requirements",
              )}
              disabled={!canEdit || editing !== null || approval.pending}
              onApprove={(value) =>
                void approval.approve(["requirements"], value)
              }
            />
          ) : null}
          {tab === "requirements" ? (
            <TabsContent
              className={diagramOpen ? "workspace-stack mt-0" : "mt-0"}
              value="review"
            >
              {editing === "requirements" ? (
                editor("requirements")
              ) : (
                <div className={diagramOpen ? "workspace-stack" : "space-y-5"}>
                  <div className="flex items-center justify-between gap-3">
                    <SourceText record={record} section="requirements" />
                    {canEdit ? (
                      <Button
                        onClick={() => setEditing("requirements")}
                        size="sm"
                        variant="outline"
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Edit requirements
                      </Button>
                    ) : null}
                  </div>

                  <Tabs
                    value={requirementView}
                    onValueChange={setRequirementView}
                    className={diagramOpen ? "workspace-stack" : undefined}
                  >
                    <TabsList aria-label="Requirement view">
                      <TabsTrigger value="builder">Rule builder</TabsTrigger>
                      <TabsTrigger value="diagram">Diagram</TabsTrigger>
                    </TabsList>
                    <TabsContent value="builder">
                      <section className="overflow-hidden rounded-xl border border-border bg-card">
                        {record.groups.length ? (
                          record.groups.map((group) => (
                            <GroupCard key={group.id} group={group} />
                          ))
                        ) : (
                          <p className="p-6 text-sm text-muted-foreground">
                            No requirements recorded.
                          </p>
                        )}
                      </section>
                    </TabsContent>
                    <TabsContent value="diagram" className="workspace-stack">
                      <StructureRequirementDiagram
                        contained
                        projection={record.projection}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </TabsContent>
          ) : null}
          <TabsContent
            className="workspace-scroll mt-0 space-y-6"
            value="preview"
            tabIndex={0}
          >
            <header>
              <p className="text-sm font-medium text-muted-foreground">
                {record.code} · {record.kind} · {record.year}
              </p>
              <h2 className="mt-2 text-3xl font-semibold">{record.name}</h2>
              {record.units !== null ? (
                <Badge className="mt-3" variant="outline">
                  {record.units} units
                </Badge>
              ) : null}
            </header>
            <p className="max-w-4xl text-sm leading-7 whitespace-pre-wrap">
              {record.description}
            </p>
            {record.projection.sections.map((section) => (
              <section
                className="rounded-xl border border-border bg-card p-5 sm:p-6"
                key={section.sectionKey}
              >
                <h3 className="mb-3 text-base font-semibold">
                  {section.heading}
                </h3>
                <p className="text-sm leading-7 whitespace-pre-wrap">
                  {section.markdown}
                </p>
              </section>
            ))}
            {record.projection.learningOutcomes.length ? (
              <section>
                <h3 className="mb-3 text-base font-semibold">
                  Learning outcomes
                </h3>
                <StructureSectionContent record={record} section="outcomes" />
              </section>
            ) : null}
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <h3 className="px-5 pt-5 text-base font-semibold">
                Requirements
              </h3>
              {record.groups.map((group) => (
                <GroupCard group={group} key={group.id} />
              ))}
            </section>
          </TabsContent>
          <TabsContent value="history" className="mt-0 space-y-5">
            <div className="flex justify-end">
              <CatalogueImportButton
                code={entry.code}
                year={entry.year}
                kind={entry.kind}
                disabled={!canImport || activeImport}
                label={activeImport ? "Import in progress" : "Re-import"}
                onStarted={() => setTab("history")}
              />
            </div>
            <CatalogueReviewHistory
              events={reviewHistory}
              workspaceHref={catalogueWorkspacePath(pathname)}
            />
            {canReviewImports ? (
              <PendingImportProposals
                pendingImports={record.pendingImports.filter(
                  (proposal) =>
                    proposal.targetId === importDetail?.target.id &&
                    proposal.candidateSnapshotId !== record.draftSnapshotId &&
                    !proposal.isCurrentDraftSource,
                )}
                currentDraftSnapshotId={record.draftSnapshotId}
                structureKind={record.kind}
              />
            ) : null}
            <StructureImportHistory entry={entry} detail={importDetail} />
          </TabsContent>
        </div>
      </AppShell>
    </Tabs>
  );
}
