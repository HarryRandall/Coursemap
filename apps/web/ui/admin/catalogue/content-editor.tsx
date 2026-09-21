"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
import { Input } from "@coursemap/ui/primitives/input";
import {
  Check,
  ChevronDown,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  requirementWriteWithTree,
  ruleIsEditableAsTree,
  treeFromRequirementWrite,
} from "@/lib/catalogue-import/requirement-tree";
import type {
  CatalogueContent,
  RequirementRuleKind,
} from "@/lib/catalogue/content";
import {
  discardDraftAction,
  publishDraftAction,
  saveCatalogueDraftAction,
  unpublishAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import { FIELD_LABELS } from "@/lib/coursemap/catalogue-kinds";
import {
  createEmptyTree,
  type ReviewedRuleTree,
} from "@/lib/coursemap/requisite-conditions";
import { RequisiteRuleTree } from "@/ui/admin/requisites/requisite-rule-tree";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { DetailsEditor, RowsEditor } from "./section-editor";
import { JsonCode } from "@/ui/common/json-code";

type Row = Record<string, string | number | boolean | null>;

const COURSE_RULES: RequirementRuleKind[] = [
  "prerequisite",
  "corequisite",
  "incompatibility",
  "permission",
  "assumed_knowledge",
];

const COURSE_COLLECTIONS: Array<{
  key: keyof NonNullable<CatalogueContent["course"]>;
  template: Row;
}> = [
  {
    key: "unitOptions",
    template: { position: 1, units: 6, label: "", sourceText: "" },
  },
  {
    key: "fees",
    template: {
      position: 1,
      feeYear: null,
      audience: "domestic",
      feeType: "tuition",
      amount: null,
      currency: "AUD",
      basis: "per_unit",
      studentContributionBand: null,
      sourceLabel: "",
      sourceText: "",
    },
  },
  { key: "areasOfInterest", template: { position: 1, name: "" } },
  {
    key: "attributes",
    template: {
      position: 1,
      attributeKind: "other",
      value: "",
      sourceText: "",
    },
  },
  {
    key: "relatedCourses",
    template: {
      position: 1,
      relationKind: "related",
      sourceCourseCode: "",
      sourceCourseTitle: "",
      sourceText: "",
    },
  },
  {
    key: "sessions",
    template: {
      position: 1,
      calendarYear: new Date().getFullYear(),
      academicPeriodCode: "S1",
      academicPeriodName: "First Semester",
      classNumber: "",
      startsOn: null,
      enrolClosesOn: null,
      censusOn: null,
      endsOn: null,
      deliveryMode: "",
      location: "",
      classSummaryUrl: "",
      sourceText: "",
    },
  },
  { key: "learningOutcomes", template: { position: 1, body: "" } },
  {
    key: "assessmentItems",
    template: {
      position: 1,
      title: "",
      weight: null,
      hurdle: null,
      dueText: "",
      sourceText: "",
    },
  },
];

const STRUCTURE_COLLECTIONS: Array<{
  key: keyof NonNullable<CatalogueContent["structure"]>;
  template: Row;
}> = [
  {
    key: "sections",
    template: {
      position: 1,
      sectionKey: "",
      heading: "",
      markdown: "",
      sourceText: "",
      sourceLocator: "manual",
    },
  },
  {
    key: "learningOutcomes",
    template: {
      position: 1,
      outcomeText: "",
      sourceText: "",
      sourceLocator: "manual",
    },
  },
  {
    key: "fees",
    template: {
      position: 1,
      feeYear: null,
      audience: "domestic",
      feeType: "tuition",
      amount: null,
      currency: "AUD",
      basis: "per_year",
      sourceLabel: "",
      sourceText: "",
      sourceLocator: "manual",
    },
  },
  {
    key: "relationships",
    template: {
      position: 1,
      relationshipKind: "option",
      targetKind: "major",
      targetCode: "",
      targetTitle: "",
      sourceText: "",
      sourceLocator: "manual",
    },
  },
];

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-lg border border-border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium [&[data-state=open]>svg]:rotate-180">
        <span>
          {title}
          {count !== undefined ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className="transition-transform"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function labelsFor(prefix: string) {
  return Object.fromEntries(
    Object.entries(FIELD_LABELS)
      .filter(([path]) => path.startsWith(`${prefix}.`))
      .map(([path, label]) => [path.slice(prefix.length + 1), label]),
  );
}

/**
 * Edits one mutable catalogue draft. Accepted changes autosave with an
 * expected revision so another tab can never be overwritten silently.
 */
export function CatalogueContentEditor({
  initial,
  recordId,
  initialRevision,
  initiallyPublished,
  initialHasUnpublishedChanges,
  path,
}: {
  initial: CatalogueContent;
  recordId: number;
  initialRevision: number;
  initiallyPublished: boolean;
  initialHasUnpublishedChanges: boolean;
  path: string;
}) {
  const router = useRouter();
  const [write, setWrite] = useState<CatalogueContent>(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [savedContent, setSavedContent] = useState(() =>
    JSON.stringify(initial),
  );
  const [saveState, setSaveState] = useState<
    "saved" | "saving" | "error" | "conflict"
  >("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [failedContent, setFailedContent] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(initiallyPublished);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    initialHasUnpublishedChanges,
  );
  const [editingSessionId, setEditingSessionId] = useState(() =>
    crypto.randomUUID(),
  );
  const currentContent = JSON.stringify(write);
  const dirty = currentContent !== savedContent;

  useEffect(() => {
    const inactivityTimeout = window.setTimeout(
      () => setEditingSessionId(crypto.randomUUID()),
      30 * 60 * 1000,
    );
    return () => window.clearTimeout(inactivityTimeout);
  }, [currentContent]);

  useEffect(() => {
    if (
      !dirty ||
      saveState === "saving" ||
      saveState === "conflict" ||
      failedContent === currentContent
    )
      return;
    const snapshot = write;
    const snapshotContent = currentContent;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      const result = await saveCatalogueDraftAction({
        recordId,
        expectedRevision: revision,
        content: snapshot,
        editingSessionId,
        path,
      });
      if (result.ok) {
        setRevision(result.revision ?? revision);
        setSavedContent(snapshotContent);
        setFailedContent(null);
        setSaveState("saved");
        if (!result.unchanged) setHasUnpublishedChanges(true);
        return;
      }
      setSaveError(result.error);
      setFailedContent(snapshotContent);
      setSaveState(result.code === "STALE_DRAFT" ? "conflict" : "error");
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [
    currentContent,
    dirty,
    editingSessionId,
    failedContent,
    path,
    recordId,
    revision,
    saveState,
    write,
  ]);

  function updateCourse(
    patch: Partial<NonNullable<CatalogueContent["course"]>>,
  ) {
    setWrite((current) =>
      current.course
        ? { ...current, course: { ...current.course, ...patch } }
        : current,
    );
  }
  function updateStructure(
    patch: Partial<NonNullable<CatalogueContent["structure"]>>,
  ) {
    setWrite((current) =>
      current.structure
        ? { ...current, structure: { ...current.structure, ...patch } }
        : current,
    );
  }
  function updateRule(
    ruleKey: RequirementRuleKind,
    tree: ReviewedRuleTree | null,
    sourceText: string,
  ) {
    setWrite((current) => ({
      ...current,
      requirements: requirementWriteWithTree(
        current.requirements,
        ruleKey,
        tree,
        sourceText,
      ),
    }));
  }

  async function publish() {
    const result = await publishDraftAction({
      recordId,
      expectedRevision: revision,
      editingSessionId,
      path,
    });
    if (!result.ok) throw new Error(result.error);
    toast.success(result.message);
    setEditingSessionId(crypto.randomUUID());
    setIsPublished(true);
    setHasUnpublishedChanges(false);
    router.refresh();
  }

  async function unpublish() {
    const result = await unpublishAction({
      recordId,
      editingSessionId,
      path,
    });
    if (!result.ok) throw new Error(result.error);
    toast.success(result.message);
    setEditingSessionId(crypto.randomUUID());
    setIsPublished(false);
    router.refresh();
  }

  async function discard() {
    const result = await discardDraftAction({
      recordId,
      expectedRevision: revision,
      editingSessionId,
      path,
    });
    if (!result.ok) throw new Error(result.error);
    toast.success(result.message);
    setEditingSessionId(crypto.randomUUID());
    setHasUnpublishedChanges(false);
    router.push(`${path}/student-view`);
    router.refresh();
  }

  const courseLabels = labelsFor("course.details");
  const structureLabels = labelsFor("structure.details");

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[6.5rem] z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          role={
            saveState === "error" || saveState === "conflict"
              ? "alert"
              : "status"
          }
          aria-live="polite"
        >
          {saveState === "saving" ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : saveState === "error" || saveState === "conflict" ? (
            <TriangleAlert
              className="size-4 text-destructive"
              aria-hidden="true"
            />
          ) : (
            <Check className="size-4 text-emerald-600" aria-hidden="true" />
          )}
          <span>
            {saveState === "saving"
              ? "Saving..."
              : saveState === "conflict"
                ? "This draft changed elsewhere"
                : saveState === "error"
                  ? `Unable to save${saveError ? `: ${saveError}` : ""}`
                  : "Saved"}
          </span>
          {saveState === "conflict" ? (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              <RefreshCw aria-hidden="true" /> Reload
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPublished ? (
            <ConfirmDialog
              title="Unpublish this record?"
              description="Students will no longer see this record for this year. Versions and draft work will be retained."
              confirmLabel="Unpublish"
              destructive
              onConfirm={unpublish}
              trigger={
                <Button variant="outline" size="sm" type="button">
                  <EyeOff aria-hidden="true" /> Unpublish
                </Button>
              }
            />
          ) : null}
          <ConfirmDialog
            title="Discard this draft?"
            description={
              hasUnpublishedChanges
                ? "Unpublished work will be removed from the editor. A restorable checkpoint will be kept in the changelog."
                : "This draft has no unpublished changes and will be removed."
            }
            confirmLabel="Discard draft"
            destructive={hasUnpublishedChanges}
            onConfirm={discard}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={dirty || saveState === "saving"}
              >
                <Trash2 aria-hidden="true" /> Discard draft
              </Button>
            }
          />
          <ConfirmDialog
            title="Publish these changes?"
            description="The saved draft will become the student-visible version. The currently published version stays live until publication succeeds."
            confirmLabel="Publish"
            onConfirm={publish}
            trigger={
              <Button
                size="sm"
                type="button"
                disabled={
                  !hasUnpublishedChanges ||
                  dirty ||
                  saveState === "saving" ||
                  saveState === "conflict"
                }
              >
                <Send aria-hidden="true" /> Publish
              </Button>
            }
          />
        </div>
      </div>

      {write.course ? (
        <>
          <Section title="Overview" defaultOpen>
            <DetailsEditor
              idPrefix="course-details"
              value={write.course.details as unknown as Row}
              labels={courseLabels}
              readOnlyKeys={["subjectCode", "level"]}
              onChange={(details) =>
                updateCourse({
                  details: details as unknown as NonNullable<
                    CatalogueContent["course"]
                  >["details"],
                })
              }
            />
          </Section>
          <Section title="Offering">
            <DetailsEditor
              idPrefix="course-offering"
              value={
                (write.course.offering ?? {
                  deliveryMode: null,
                  location: null,
                }) as Row
              }
              onChange={(offering) =>
                updateCourse({
                  offering: offering as NonNullable<
                    CatalogueContent["course"]
                  >["offering"],
                })
              }
            />
          </Section>
          {COURSE_COLLECTIONS.map(({ key, template }) => (
            <Section
              key={key}
              title={FIELD_LABELS[`course.${key}`] ?? key}
              count={(write.course![key] as Row[]).length}
            >
              <RowsEditor
                idPrefix={`course-${key}`}
                rows={write.course![key] as unknown as Row[]}
                template={template}
                emptyLabel={`No ${(FIELD_LABELS[`course.${key}`] ?? key).toLowerCase()} recorded.`}
                onChange={(rows) => updateCourse({ [key]: rows } as never)}
              />
            </Section>
          ))}
          {COURSE_RULES.map((ruleKey) => (
            <RuleSection
              key={ruleKey}
              ruleKey={ruleKey}
              requirements={write.requirements}
              onChange={(tree, sourceText) =>
                updateRule(ruleKey, tree, sourceText)
              }
            />
          ))}
        </>
      ) : null}

      {write.structure ? (
        <>
          <Section title="Overview" defaultOpen>
            <DetailsEditor
              idPrefix="structure-details"
              value={write.structure.details as unknown as Row}
              labels={structureLabels}
              onChange={(details) =>
                updateStructure({
                  details: details as unknown as NonNullable<
                    CatalogueContent["structure"]
                  >["details"],
                })
              }
            />
          </Section>
          {STRUCTURE_COLLECTIONS.map(({ key, template }) => (
            <Section
              key={key}
              title={FIELD_LABELS[`structure.${key}`] ?? key}
              count={(write.structure![key] as Row[]).length}
            >
              <RowsEditor
                idPrefix={`structure-${key}`}
                rows={write.structure![key] as unknown as Row[]}
                template={template}
                emptyLabel={`No ${(FIELD_LABELS[`structure.${key}`] ?? key).toLowerCase()} recorded.`}
                onChange={(rows) => updateStructure({ [key]: rows } as never)}
              />
            </Section>
          ))}
          <RuleSection
            ruleKey="structure"
            requirements={write.requirements}
            onChange={(tree, sourceText) =>
              updateRule("structure", tree, sourceText)
            }
          />
        </>
      ) : null}
    </div>
  );
}

function RuleSection({
  ruleKey,
  requirements,
  onChange,
}: {
  ruleKey: RequirementRuleKind;
  requirements: CatalogueContent["requirements"];
  onChange: (tree: ReviewedRuleTree | null, sourceText: string) => void;
}) {
  const rule = requirements.rules.find(
    (candidate) => candidate.key === ruleKey,
  );
  const editable = ruleIsEditableAsTree(requirements, ruleKey);
  const tree = useMemo(
    () => treeFromRequirementWrite(requirements, ruleKey),
    [requirements, ruleKey],
  );
  const [sourceText, setSourceText] = useState(rule?.sourceText ?? "");
  const conditionCount = requirements.conditions.filter(
    (condition) => condition.ruleKey === ruleKey,
  ).length;
  return (
    <Section
      title={FIELD_LABELS[`requirements.${ruleKey}`] ?? ruleKey}
      count={conditionCount}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium"
            htmlFor={`rule-${ruleKey}-source`}
          >
            Source wording shown to students
          </label>
          <Input
            id={`rule-${ruleKey}-source`}
            value={sourceText}
            placeholder="As written on the ANU page"
            onChange={(event) => {
              setSourceText(event.target.value);
              if (tree) onChange(tree, event.target.value);
            }}
          />
        </div>
        {editable ? (
          <RequisiteRuleTree
            canEdit
            tree={tree ?? createEmptyTree(`${ruleKey}-root`)}
            onChange={(next) => onChange(next, sourceText)}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This rule uses condition kinds the editor cannot yet represent, so
              it is shown as recorded.
            </p>
            <JsonCode label={ruleKey} value={tree} uncapped />
          </>
        )}
        {rule && tree ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="self-start"
            onClick={() => onChange(null, sourceText)}
          >
            Remove this rule
          </Button>
        ) : null}
      </div>
    </Section>
  );
}
