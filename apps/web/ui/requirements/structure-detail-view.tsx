"use client";

import {
  Banknote,
  BookOpen,
  GraduationCap,
  Library,
  ListChecks,
  Target,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import {
  FILLING_STAGE_KINDS,
  requirementStages,
} from "@/lib/coursemap/requirement-stages";
import type {
  StructureDetails,
  StructureFee,
} from "@/lib/coursemap/structure-types";
import {
  STRUCTURE_FEE_AUDIENCE_LABELS,
  STRUCTURE_FEE_BASIS_LABELS,
  STRUCTURE_FEE_TYPE_LABELS,
} from "@/lib/coursemap/structure-types";
import { CatalogueMarkdown } from "@/ui/common/catalogue-markdown";
import { RequirementStageList } from "@/ui/requirements/requirement-stage-list";
import type { TreeContext } from "@/ui/requirements/requirement-presentation";
import { StructureComposition } from "@/ui/requirements/structure-composition";
import { StructureInformation } from "@/ui/requirements/structure-information";
import { StructureRelated } from "@/ui/requirements/structure-related";

export const structureDetailTabs = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "requirements", label: "Requirements", icon: ListChecks },
  { id: "information", label: "Information", icon: Library },
] as const;
export type StructureTab = (typeof structureDetailTabs)[number]["id"];
export function structureTabFromSearch(value: string | null): StructureTab {
  return structureDetailTabs.some((tab) => tab.id === value)
    ? (value as StructureTab)
    : "overview";
}

/**
 * Shared so the administrator preview shows exactly the tabs a reader sees.
 */
export function StructureDetailTabsList() {
  return (
    <TabsList variant="line">
      {structureDetailTabs.map(({ id, label, icon: Icon }) => (
        <TabsTrigger key={id} value={id}>
          <Icon size={15} aria-hidden="true" className="hidden sm:block" />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

/** The fee as a figure, or null when ANU states it only in prose. */
function feeAmount(fee: StructureFee) {
  if (fee.amount === null) return null;
  const amount = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: fee.currency ?? "AUD",
    maximumFractionDigits: fee.amount % 1 === 0 ? 0 : 2,
  }).format(fee.amount);
  const basis = STRUCTURE_FEE_BASIS_LABELS[fee.basis] ?? "";
  return basis ? `${amount} ${basis}` : amount;
}

/**
 * The reader's body of a structure page. The student route and the import
 * preview both render this, so a draft preview cannot drift away from what a
 * reader will see once it is published.
 */
export function StructureDetailView({
  structure,
  treeContext,
}: {
  structure: StructureDetails;
  treeContext: TreeContext;
}) {
  const kindLabel = CATALOGUE_KIND_LABELS[structure.kind].singular;
  // What a reader needs first sits under the name in one line; figures that
  // only matter when applying keep a card of their own.
  const summary = [
    structure.units === null ? null : `${structure.units} units`,
    structure.durationYears === null
      ? null
      : `${structure.durationYears} ${structure.durationYears === 1 ? "year" : "years"}`,
    structure.college,
    structure.academicCareer,
    structure.modeOfDelivery,
  ].filter((entry): entry is string => Boolean(entry));
  const admission = [
    [
      "Selection rank",
      structure.selectionRank === null ? null : `${structure.selectionRank}`,
    ],
    ["ATAR", structure.atar === null ? null : `${structure.atar}`],
    ["Study as", structure.studyAs],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const availableCourseCodes = new Set(
    treeContext.catalogue.courses.map((course) => course.code),
  );
  const stages = structure.requirements
    ? requirementStages(structure.requirements, {
        unitTarget: treeContext.unitTarget,
        showStructureOptions: treeContext.showStructureOptions,
        courses: treeContext.catalogue.courses.filter(
          (course) => course.year === treeContext.catalogue.academicYear,
        ),
      })
    : [];
  const sizedStages = stages.some(
    (stage) =>
      FILLING_STAGE_KINDS.has(stage.kind) &&
      stage.units !== null &&
      stage.units > 0,
  );

  return (
    <div className="w-full">
      <header className="flex flex-col gap-1.5 pb-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {kindLabel} · {structure.year} ·{" "}
          <span className="font-mono normal-case">{structure.code}</span>
        </p>
        <h1 className="text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
          {structure.name}
        </h1>
        {summary.length ? (
          <p className="text-sm text-muted-foreground">{summary.join(" · ")}</p>
        ) : null}
      </header>

      <TabsContent value="overview">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>About this {kindLabel.toLowerCase()}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 border-t border-border/60 pt-5 text-sm leading-relaxed text-foreground/80">
                {structure.introduction ? (
                  <CatalogueMarkdown
                    markdown={structure.introduction}
                    academicYear={structure.year}
                    availableCourseCodes={availableCourseCodes}
                  />
                ) : null}
                {structure.description ? (
                  <CatalogueMarkdown
                    markdown={structure.description}
                    academicYear={structure.year}
                    availableCourseCodes={availableCourseCodes}
                  />
                ) : null}
                {!structure.introduction && !structure.description ? (
                  <p className="text-muted-foreground">
                    The ANU page carries no description for this{" "}
                    {kindLabel.toLowerCase()}.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {sizedStages ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>Structure</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="border-t border-border/60 pt-5">
                  <StructureComposition
                    stages={stages}
                    unitTarget={treeContext.unitTarget ?? null}
                  />
                </CardContent>
              </Card>
            ) : null}

            {structure.learningOutcomes.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>Learning outcomes</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="border-t border-border/60 pt-5">
                  <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/80">
                    {structure.learningOutcomes.map((outcome) => (
                      <li key={outcome.position}>{outcome.outcomeText}</li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {admission.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>Admission</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="border-t border-border/60 pt-5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {admission.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-0.5">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}

            {structure.fees.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>Indicative fees</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 border-t border-border/60 pt-5 text-sm">
                  {structure.fees.map((fee) => (
                    <div key={fee.position}>
                      <p className="text-xs text-muted-foreground">
                        {[
                          STRUCTURE_FEE_AUDIENCE_LABELS[fee.audience] ?? "Fee",
                          STRUCTURE_FEE_TYPE_LABELS[fee.feeType] ?? "Fee",
                          fee.feeYear,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-0.5 flex items-start gap-2">
                        <Banknote
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {feeAmount(fee) !== null ? (
                          <p>{feeAmount(fee)}</p>
                        ) : fee.sourceText ? (
                          <CatalogueMarkdown
                            markdown={fee.sourceText}
                            academicYear={structure.year}
                            availableCourseCodes={availableCourseCodes}
                          />
                        ) : (
                          <p>See the ANU source</p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <StructureRelated structure={structure} />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="requirements" className="flex flex-col gap-4">
        {structure.requirements ? (
          <RequirementStageList stages={stages} context={treeContext} />
        ) : (
          <Empty className="rounded-xl border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Target aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No requirements imported yet</EmptyTitle>
              <EmptyDescription>
                The ANU page for this {kindLabel.toLowerCase()} has not been
                read into a requirement tree.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TabsContent>

      <TabsContent value="information" className="flex flex-col gap-4">
        {structure.sections.length ? (
          <StructureInformation
            sections={structure.sections}
            academicYear={structure.year}
            availableCourseCodes={availableCourseCodes}
          />
        ) : (
          <Empty className="rounded-xl border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GraduationCap aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Nothing further published</EmptyTitle>
              <EmptyDescription>
                The ANU page carried no sections beyond the requirements.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TabsContent>
    </div>
  );
}
