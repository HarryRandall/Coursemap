"use client";

import {
  Banknote,
  BookOpen,
  GraduationCap,
  Library,
  ListChecks,
  Target,
} from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
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
import { SectionNavigation } from "@/ui/common/section-navigation";
import { RequirementGroupView } from "@/ui/requirements/requirement-tree";
import type { TreeContext } from "@/ui/requirements/requirement-presentation";
import { StructureRelated } from "@/ui/requirements/structure-related";
import {
  StructureSectionCard,
  structureSectionAnchor,
} from "@/ui/requirements/structure-section";

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

function feeAmount(fee: StructureFee) {
  if (fee.amount === null) return fee.sourceText ?? "See the ANU source";
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
  const facts = [
    ["Units", structure.units === null ? null : `${structure.units} units`],
    [
      "Duration",
      structure.durationYears === null
        ? null
        : `${structure.durationYears} years`,
    ],
    ["Academic career", structure.academicCareer],
    ["College", structure.college],
    ["Delivery", structure.modeOfDelivery],
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

  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 pb-5">
        <div className="min-w-0">
          <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
            {structure.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline">{structure.code}</Badge>
            <Badge variant="outline">{structure.year}</Badge>
            <Badge variant="outline">{kindLabel}</Badge>
            {structure.units !== null ? (
              <Badge variant="outline">{structure.units} units</Badge>
            ) : null}
            {structure.modeOfDelivery ? (
              <Badge variant="outline">{structure.modeOfDelivery}</Badge>
            ) : null}
          </div>
          {structure.college || structure.academicCareer ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {[structure.college, structure.academicCareer]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
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
            {facts.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>At a glance</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="border-t border-border/60 pt-5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {facts.map(([label, value]) => (
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
                      <p className="mt-0.5 flex items-center gap-2">
                        <Banknote
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {feeAmount(fee)}
                      </p>
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
          <RequirementGroupView
            group={structure.requirements}
            context={treeContext}
          />
        ) : (
          <Empty className="rounded-xl border border-dashed bg-card py-12">
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
          <>
            {/* A jump list earns its place only when there is enough to
                scroll past; above one or two cards it repeated their titles. */}
            {structure.sections.length >= 3 ? (
              <SectionNavigation
                sections={structure.sections.map((section) => ({
                  id: structureSectionAnchor(section),
                  label: section.heading,
                }))}
              />
            ) : null}
            {structure.sections.map((section) => (
              <StructureSectionCard
                key={section.sectionKey}
                section={section}
                academicYear={structure.year}
                availableCourseCodes={availableCourseCodes}
              />
            ))}
          </>
        ) : (
          <Empty className="rounded-xl border border-dashed bg-card py-12">
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
