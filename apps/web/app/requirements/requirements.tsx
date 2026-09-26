"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Tabs, TabsTrigger, TabsContent } from "@coursemap/ui/primitives/tabs";
import { useCoursemap } from "@/app/providers";
import { AppShell } from "@/ui/shell";
import { OutlinedTabsList } from "@/ui/common/outlined-tabs-list";
import { OnboardingPrompt } from "@/ui/common/onboarding-prompt";
import type {
  PlanCatalogue,
  PlanStructureKind,
} from "@/lib/coursemap/plan-catalogue";
import type {
  OnboardingCatalogue,
  ProgrammeOption,
} from "@/lib/coursemap/onboarding-catalogue";
import type { SelectableStructureKind } from "@/lib/coursemap/programme-structure-options";
import type { Course } from "@/lib/coursemap/types";
import {
  allocateRequirements,
  placementOptions,
  requirementConditionsByKey,
  requirementTreeProgress,
} from "@/lib/coursemap/requirement-progress";
import {
  conditionHeading,
  type RequirementTreeCondition,
} from "@/ui/requirements/requirement-presentation";
import { requirementCourseStatus } from "@/lib/coursemap/requirement-display";
import {
  degreeUnitProgress,
  planningCourseForAttempt,
  unitsForAttempt,
} from "@/lib/planner";
import { RequirementGroupView } from "@/ui/requirements/requirement-tree";
import { StructureProgress } from "@/ui/requirements/structure-progress";
import { StructureEmptyState } from "@/ui/requirements/structure-empty-state";
import { StructureChoices } from "@/ui/requirements/structure-choices";
import { TermChooser } from "@/ui/overlays/term-chooser";

const sections = [
  { kind: "programme", label: "Degree" },
  { kind: "major", label: "Major" },
  { kind: "minor", label: "Minors" },
  { kind: "specialisation", label: "Specialisations" },
] as const;

export function Requirements({
  catalogue,
  choices,
  initialTab = "programme",
}: {
  catalogue: PlanCatalogue;
  choices: OnboardingCatalogue;
  /** The section to open first, such as the major when adding one. */
  initialTab?: PlanStructureKind;
}) {
  const { state, updateProfile, notify, setPlacement } = useCoursemap();
  const router = useRouter();
  const [tab, setTab] = useState<PlanStructureKind>(initialTab);
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState(false);
  const [addingCourse, setAddingCourse] = useState<Course | null>(null);
  const degree = catalogue.degrees.find(
    (item) => item.code === state.profile.degreeCode,
  );
  const programme = choices.degrees.find(
    (item) =>
      item.code === state.profile.degreeCode &&
      item.catalogueYear === catalogue.academicYear,
  );
  const selected = {
    programme: [state.profile.degreeCode].filter(Boolean),
    major: [state.profile.majorCode].filter(Boolean),
    minor: state.profile.minorCodes,
    specialisation: state.profile.specialisationCodes,
  };
  const selectedCodes = new Set(Object.values(selected).flat());
  const attemptStatuses = new Map(
    [...new Set(state.attempts.map((attempt) => attempt.courseCode))].flatMap(
      (code) => {
        const status = requirementCourseStatus(code, state.attempts);
        return status ? [[code, status] as const] : [];
      },
    ),
  );
  const options = {
    major: choices.majors.filter(
      (item) =>
        item.catalogueYear === catalogue.academicYear &&
        programme?.majorCodes.includes(item.code),
    ),
    minor: choices.minors.filter(
      (item) =>
        item.catalogueYear === catalogue.academicYear &&
        programme?.minorCodes.includes(item.code),
    ),
    specialisation: choices.specialisations.filter(
      (item) =>
        item.catalogueYear === catalogue.academicYear &&
        programme?.specialisationCodes.includes(item.code),
    ),
  };
  function changeTab(kind: PlanStructureKind) {
    setTab(kind);
    setChoosing(false);
  }
  async function chooseStructure(
    kind: SelectableStructureKind,
    option: ProgrammeOption,
  ) {
    if (pending) return;
    setPending(true);
    try {
      const patch =
        kind === "major"
          ? { majorCode: option.code }
          : kind === "minor"
            ? {
                minorCodes: [
                  ...new Set([...state.profile.minorCodes, option.code]),
                ],
              }
            : {
                specialisationCodes: [
                  ...new Set([
                    ...state.profile.specialisationCodes,
                    option.code,
                  ]),
                ],
              };
      const result = await updateProfile(patch);
      notify(result.message, result.ok ? "success" : "warning");
      if (result.ok) {
        setChoosing(false);
        router.refresh();
      }
    } catch {
      notify("Couldn't save your selection. Try again.", "warning");
    } finally {
      setPending(false);
    }
  }
  const fillEmpty =
    tab === "programme" ? !degree : selected[tab].length === 0 && !choosing;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => changeTab(value as PlanStructureKind)}
      className="block"
    >
      <AppShell fill>
        <h1 className="sr-only">Requirements</h1>
        <StructureProgress
          name={degree ? (programme?.name ?? degree.name) : "Your degree"}
          target={degree?.units ?? null}
          enrolledUnits={state.attempts
            .filter((attempt) => attempt.status === "enrolled")
            .reduce((total, attempt) => {
              const course = planningCourseForAttempt(attempt, catalogue);
              return course ? total + unitsForAttempt(attempt, course) : total;
            }, 0)}
          progress={degreeUnitProgress(
            state.attempts,
            degree?.units ?? 0,
            catalogue,
          )}
        />
        <OutlinedTabsList className="mb-5" aria-label="Requirement sections">
          {sections.map(({ kind, label }) => (
            <TabsTrigger key={kind} value={kind}>
              {label}
              {selected[kind].length > 1 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {selected[kind].length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </OutlinedTabsList>
        {sections.map(({ kind, label }) => (
          <TabsContent
            key={kind}
            value={kind}
            className={`workspace-scroll mt-0 ${fillEmpty ? "flex flex-col" : "space-y-6"}`}
          >
            {kind !== "programme" &&
            selected[kind].length > 0 &&
            (choosing ||
              options[kind].some((item) => !selectedCodes.has(item.code))) ? (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setChoosing(!choosing)}
                >
                  {choosing ? (
                    <X size={14} aria-hidden="true" />
                  ) : (
                    <Plus size={14} aria-hidden="true" />
                  )}
                  {choosing
                    ? "Close choices"
                    : kind === "major"
                      ? "Change major"
                      : `Add ${kind}`}
                </Button>
              </div>
            ) : null}
            {kind !== "programme" &&
            selected[kind].length === 0 &&
            !choosing ? (
              <StructureEmptyState
                kind={kind}
                available={options[kind].length > 0}
                needsDegree={!degree}
                onChoose={() => setChoosing(true)}
              />
            ) : null}
            {kind !== "programme" && choosing ? (
              <StructureChoices
                key={kind}
                kind={kind}
                options={options[kind].filter(
                  (item) => !selectedCodes.has(item.code),
                )}
                pending={pending}
                onSelect={(option) => void chooseStructure(kind, option)}
              />
            ) : null}
            {kind === "programme" && !degree ? <OnboardingPrompt /> : null}
            {selected[kind].map((code) => {
              const requirements = catalogue.structureRequirements.find(
                (item) =>
                  item.structureCode === code && item.structureKind === kind,
              );
              const structure = catalogue.structures.find(
                (item) => item.code === code && item.kind === kind,
              );
              const option =
                kind === "programme"
                  ? programme
                  : [
                      ...choices.majors,
                      ...choices.minors,
                      ...choices.specialisations,
                    ].find(
                      (item) =>
                        item.code === code &&
                        item.catalogueYear === catalogue.academicYear,
                    );
              const target =
                kind === "programme"
                  ? (degree?.units ?? null)
                  : (option?.units ?? null);
              const root = requirements?.root ?? null;
              const conditions = requirementConditionsByKey(root);
              const nodeKeyFor = (projectionKey: string) =>
                [...conditions].find(
                  ([, condition]) => condition.projectionKey === projectionKey,
                )?.[0];
              // A student's choices name rules by their stable key; a choice
              // for a rule this version no longer has is simply not applied.
              const pins = new Map(
                (state.placements ?? []).flatMap((choice) => {
                  const nodeKey =
                    choice.structureCode === code
                      ? nodeKeyFor(choice.requirementKey)
                      : undefined;
                  return nodeKey ? [[choice.courseCode, nodeKey] as const] : [];
                }),
              );
              const allocation = allocateRequirements({
                root,
                attempts: state.attempts,
                catalogue,
                pins,
              });
              const treeProgress = requirementTreeProgress({
                root,
                attempts: state.attempts,
                catalogue,
                allocation,
              });
              const labelFor = (nodeKey: string) => {
                const condition = conditions.get(nodeKey);
                return condition
                  ? conditionHeading(condition as RequirementTreeCondition)
                  : "another requirement";
              };
              const placement = {
                allocation,
                labelFor,
                optionsFor: (courseCode: string) => {
                  const attempt = state.attempts.find(
                    (candidate) => candidate.courseCode === courseCode,
                  );
                  const course = attempt
                    ? planningCourseForAttempt(attempt, catalogue)
                    : undefined;
                  return course
                    ? placementOptions({ root, course }).map((nodeKey) => ({
                        nodeKey,
                        label: labelFor(nodeKey),
                      }))
                    : [];
                },
                onPlace: (courseCode: string, nodeKey: string | null) => {
                  const projectionKey = nodeKey
                    ? conditions.get(nodeKey)?.projectionKey
                    : undefined;
                  void setPlacement(
                    courseCode,
                    projectionKey
                      ? { structureCode: code, requirementKey: projectionKey }
                      : null,
                  ).then((result) => {
                    if (!result.ok) notify(result.message, "warning");
                  });
                },
              };
              return (
                <div key={code} className="space-y-5">
                  {kind !== "programme" && (
                    <h2 className="text-base font-semibold">
                      {structure?.name ?? option?.name ?? code}
                      {target !== null && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {target} units
                        </span>
                      )}
                    </h2>
                  )}
                  {requirements?.root ? (
                    <RequirementGroupView
                      group={requirements.root}
                      context={{
                        catalogue,
                        progress: treeProgress,
                        placement,
                        attemptStatusByCode: attemptStatuses,
                        selectedStructureCodes: selectedCodes,
                        unitTarget: target,
                        onAddCourse: setAddingCourse,
                      }}
                    />
                  ) : (
                    <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
                      Your {label.toLowerCase()} is selected.{" "}
                      <Link
                        className="font-medium text-primary hover:underline"
                        href="/plan"
                      >
                        Continue planning courses
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>
        ))}
        {addingCourse ? (
          <TermChooser
            course={addingCourse}
            onClose={() => setAddingCourse(null)}
          />
        ) : null}
      </AppShell>
    </Tabs>
  );
}
