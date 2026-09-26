"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
import { Input } from "@coursemap/ui/primitives/input";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

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
  STRUCTURE_RELATIONSHIP_KINDS,
  STRUCTURE_RELATIONSHIP_LABELS,
  STRUCTURE_SECTION_KEYS,
  STRUCTURE_SECTION_LABELS,
  isStructureSectionKey,
} from "@/lib/catalogue/structure-vocabulary";
import {
  CATALOGUE_KIND_LABELS,
  FIELD_LABELS,
} from "@/lib/coursemap/catalogue-kinds";
import {
  createEmptyTree,
  type ReviewedRuleTree,
} from "@/lib/coursemap/requisite-conditions";
import { RequisiteRuleTree } from "@/ui/admin/requisites/requisite-rule-tree";
import { useCatalogueEditor } from "./catalogue-editor-context";
import { TagsEditor } from "./tags-editor";
import { DetailsEditor, type FieldChoice, RowsEditor } from "./section-editor";
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

const STRUCTURE_KIND_CHOICES: FieldChoice[] = (
  ["programme", "major", "minor", "specialisation"] as const
).map((kind) => ({ value: kind, label: CATALOGUE_KIND_LABELS[kind].singular }));

const STRUCTURE_COLLECTIONS: Array<{
  key: keyof NonNullable<CatalogueContent["structure"]>;
  template: Row;
  hiddenKeys?: string[];
  choices?: Partial<Record<string, readonly FieldChoice[]>>;
  /** Fills fields that follow from others, such as a section's heading. */
  normalise?: (row: Row) => Row;
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
    hiddenKeys: ["position", "heading"],
    choices: {
      sectionKey: STRUCTURE_SECTION_KEYS.map((key) => ({
        value: key,
        label: STRUCTURE_SECTION_LABELS[key],
      })),
    },
    normalise: (row) => ({
      ...row,
      heading: isStructureSectionKey(row.sectionKey)
        ? STRUCTURE_SECTION_LABELS[row.sectionKey]
        : "",
    }),
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
    choices: {
      relationshipKind: STRUCTURE_RELATIONSHIP_KINDS.map((kind) => ({
        value: kind,
        label: STRUCTURE_RELATIONSHIP_LABELS[kind],
      })),
      targetKind: STRUCTURE_KIND_CHOICES,
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
 * The fields of one catalogue record. The editing session they read and write
 * - what is saved, what is published, whether they may be changed at all -
 * belongs to the provider above them, so the toolbar reporting that session
 * can sit above the record's title instead of above these fields.
 */
export function CatalogueContentEditor() {
  const { editing, setWrite, write } = useCatalogueEditor();

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

  const courseLabels = labelsFor("course.details");
  const structureLabels = labelsFor("structure.details");

  return (
    <div className="flex flex-col gap-4">
      {write.course ? (
        <>
          <Section title="Overview" defaultOpen>
            <DetailsEditor
              idPrefix="course-details"
              value={write.course.details as unknown as Row}
              labels={courseLabels}
              readOnly={!editing}
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
          {!editing && !write.course.tags?.length ? null : (
            <Section
              title={FIELD_LABELS["course.tags"] ?? "Tags"}
              count={write.course.tags?.length ?? 0}
            >
              <TagsEditor
                tags={write.course.tags ?? []}
                readOnly={!editing}
                onChange={(tags) =>
                  setWrite((current) => {
                    if (!current.course) return current;
                    // No tags is no key, so the content hashes as it did
                    // before tags existed.
                    const course: NonNullable<CatalogueContent["course"]> = {
                      ...current.course,
                      tags,
                    };
                    if (!tags.length) delete course.tags;
                    return { ...current, course };
                  })
                }
              />
            </Section>
          )}
          {!editing &&
          !Object.values(write.course.offering ?? {}).some(
            (value) => value !== null && value !== "",
          ) ? null : (
            <Section title="Offering">
              <DetailsEditor
                idPrefix="course-offering"
                value={
                  (write.course.offering ?? {
                    deliveryMode: null,
                    location: null,
                  }) as Row
                }
                readOnly={!editing}
                onChange={(offering) =>
                  updateCourse({
                    offering: offering as NonNullable<
                      CatalogueContent["course"]
                    >["offering"],
                  })
                }
              />
            </Section>
          )}
          {COURSE_COLLECTIONS.map(({ key, template }) =>
            // A collection nobody filled in is part of the form, not part of
            // the record, so reading one leaves it out entirely.
            !editing && (write.course![key] as Row[]).length === 0 ? null : (
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
                  readOnly={!editing}
                  onChange={(rows) => updateCourse({ [key]: rows } as never)}
                />
              </Section>
            ),
          )}
          {COURSE_RULES.map((ruleKey) => (
            <RuleSection
              key={ruleKey}
              ruleKey={ruleKey}
              readOnly={!editing}
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
              readOnly={!editing}
              onChange={(details) =>
                updateStructure({
                  details: details as unknown as NonNullable<
                    CatalogueContent["structure"]
                  >["details"],
                })
              }
            />
          </Section>
          {STRUCTURE_COLLECTIONS.map(
            ({ key, template, hiddenKeys, choices, normalise }) =>
              !editing &&
              (write.structure![key] as Row[]).length === 0 ? null : (
                <Section
                  key={key}
                  title={FIELD_LABELS[`structure.${key}`] ?? key}
                  count={(write.structure![key] as Row[]).length}
                >
                  <RowsEditor
                    idPrefix={`structure-${key}`}
                    rows={write.structure![key] as unknown as Row[]}
                    template={template}
                    hiddenKeys={hiddenKeys}
                    choices={choices}
                    emptyLabel={`No ${(FIELD_LABELS[`structure.${key}`] ?? key).toLowerCase()} recorded.`}
                    readOnly={!editing}
                    onChange={(rows) =>
                      updateStructure({
                        [key]: normalise ? rows.map(normalise) : rows,
                      } as never)
                    }
                  />
                </Section>
              ),
          )}
          <RuleSection
            ruleKey="structure"
            readOnly={!editing}
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
  readOnly = false,
}: {
  ruleKey: RequirementRuleKind;
  requirements: CatalogueContent["requirements"];
  onChange: (tree: ReviewedRuleTree | null, sourceText: string) => void;
  readOnly?: boolean;
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
  if (readOnly && !rule && conditionCount === 0 && !sourceText) return null;
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
            readOnly={readOnly}
            placeholder="As written on the ANU page"
            onChange={(event) => {
              setSourceText(event.target.value);
              if (tree) onChange(tree, event.target.value);
            }}
          />
        </div>
        {editable ? (
          <RequisiteRuleTree
            canEdit={!readOnly}
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
        {rule && tree && !readOnly ? (
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
