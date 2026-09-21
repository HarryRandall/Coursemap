"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
import { Input } from "@coursemap/ui/primitives/input";
import { ChevronDown, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { saveManualVersionAction } from "@/lib/coursemap/admin-catalogue-actions";
import { FIELD_LABELS } from "@/lib/coursemap/catalogue-kinds";
import {
  createEmptyTree,
  type ReviewedRuleTree,
} from "@/lib/coursemap/requisite-conditions";
import { RequisiteRuleTree } from "@/ui/admin/requisites/requisite-rule-tree";
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
 * Edits every section of a snapshot and saves the result as a new manual
 * draft. Course requisite rules use the tree editor; every other section is
 * a typed form over its rows.
 */
export function VersionEditor({
  initial,
  recordId,
  baseSnapshotId,
  path,
}: {
  initial: CatalogueContent;
  recordId: number;
  baseSnapshotId: number | null;
  path: string;
}) {
  const router = useRouter();
  const [write, setWrite] = useState<CatalogueContent>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = useMemo(
    () => JSON.stringify(write) !== JSON.stringify(initial),
    [write, initial],
  );

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

  function save() {
    startTransition(async () => {
      const result = await saveManualVersionAction({
        recordId,
        baseSnapshotId,
        write,
        path,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.replace(`${path}&tab=preview`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const courseLabels = labelsFor("course.details");
  const structureLabels = labelsFor("structure.details");

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[6.5rem] z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-4 py-2 backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {dirty
            ? "Unsaved edits. Saving creates a new draft snapshot."
            : "Editing the current draft or published content."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={!dirty || pending}
            onClick={() => setWrite(initial)}
          >
            Reset
          </Button>
          <Button type="button" disabled={!dirty || pending} onClick={save}>
            {pending ? (
              <LoaderCircle
                size={16}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            Save as draft
          </Button>
        </div>
      </div>

      {write.course ? (
        <>
          <Section title="Details" defaultOpen>
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
          <Section title="Details" defaultOpen>
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
          <Section
            title="Requirements"
            count={write.requirements.conditions.length}
          >
            <p className="mb-3 text-sm text-muted-foreground">
              Structure requirements are shown as recorded. A dedicated editor
              for unit rules, course lists and structure options is planned;
              until then edit the imported source or re-import.
            </p>
            <JsonCode
              label="Requirements"
              value={write.requirements}
              uncapped
            />
          </Section>
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
