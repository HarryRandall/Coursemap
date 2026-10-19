"use client";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { Button } from "@coursemap/ui/primitives/button";
import ReuiLink from "next/link";

import {
  AlertTriangle,
  Check,
  Plus,
  ExternalLink,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { useCoursemap } from "@/app/providers";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt, Course, Profile } from "@/lib/coursemap/types";
import { planStructureCodes } from "@/lib/coursemap/plan-structure-codes";
import {
  effectiveStatus,
  isActiveAttempt,
  missingPrereqs,
  planningCourseForAttempt,
  plannedDependents,
  termForAttempt,
  termIndex,
  unitsForAttempt,
} from "@/lib/planner";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import { permissionClauses } from "@/lib/coursemap/requisite-tree";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import {
  groupSentence,
  requisiteSentence,
  softRequirementLabel,
  standaloneWording,
  splitRequisiteRule,
} from "@/ui/courses/requisite-wording";
import { FactRow } from "@/ui/overlays/fact-row";
import {
  PlanCodeChip,
  RequirementChips,
  UncheckedMark,
} from "@/ui/overlays/requirement-chips";
import { useCourseDetails } from "@/lib/coursemap/use-course-details";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";

import { CodeChip } from "@/ui/common/code-chip";
import { StatusPill } from "@/ui/common/status-pill";
import { CourseAbout } from "@/ui/overlays/course-about";
import { StarButton } from "@/ui/common/star-button";
import { FixIssueButton } from "@/ui/plan/fix-issue-button";

/** "First Semester" as S1, so the header stays one line. */
function shortSession(session: string) {
  if (/first|semester 1\b/i.test(session)) return "S1";
  if (/second|semester 2\b/i.test(session)) return "S2";
  return session;
}
const COURSE_CODE = /\b[A-Z]{4}\d{4}\b/g;

/**
 * The plan as a student record for one course's requisites: courses planned
 * or done before its semester count as completed, and ones beside it as
 * taken at the same time.
 */
function planStudentRecord(
  attempt: Attempt,
  attempts: Attempt[],
  profile: Pick<
    Profile,
    "degreeCode" | "majorCode" | "minorCodes" | "specialisationCodes"
  >,
  commencementYear: number | null,
  catalogue?: PlanCatalogue,
): StudentRecord {
  const order = termIndex(attempt.termId, catalogue);
  const others = attempts.filter(
    (other) => other.id !== attempt.id && isActiveAttempt(other),
  );
  return {
    completed: new Map(
      others
        .filter((other) => termIndex(other.termId, catalogue) < order)
        .map((other) => {
          const course = planningCourseForAttempt(other, catalogue);
          return [
            other.courseCode.toUpperCase(),
            {
              units: unitsForAttempt(other, course),
              mark: other.mark ?? null,
              tags: course?.tags ?? [],
            },
          ];
        }),
    ),
    enrolled: new Set(
      others
        .filter((other) => termIndex(other.termId, catalogue) === order)
        .map((other) => other.courseCode.toUpperCase()),
    ),
    enrolledUnits: new Map(
      others
        .filter((other) => termIndex(other.termId, catalogue) === order)
        .map((other) => [
          other.courseCode.toUpperCase(),
          unitsForAttempt(other, planningCourseForAttempt(other, catalogue)),
        ]),
    ),
    commencementYear,
    enrolmentMode: catalogue?.enrolmentMode,
    programmeCodes: profile.degreeCode ? [profile.degreeCode] : [],
    programmeColleges: catalogue?.programmeColleges,
    programmeCareers: catalogue?.programmeCareers,
    structureCodes: planStructureCodes(profile),
    permissionApproved: attempt.permissionApproved ?? false,
    wam: null,
    gpa: null,
    studyYear: null,
  };
}

/** A course that is not in the plan yet, opened to read before adding it. */
export type CoursePreview = {
  course: Course;
  addLabel: string;
  onAdd: () => void;
};

/**
 * A planned or recorded course in one scrolling view: what it is, where it
 * sits in the plan, its requisite chain, then assessment and outcomes, with
 * the plan actions along the bottom. While the course is planned, a missing
 * prerequisite shows above the body and opens the enrolment steps.
 * Given a preview instead, the same view offers to add the course.
 */
export function CourseDialog({
  attemptId,
  preview,
  catalogue: suppliedCatalogue,
  onClose,
}: {
  attemptId?: string;
  preview?: CoursePreview;
  catalogue?: PlanCatalogue;
  onClose: () => void;
}) {
  const restoreFocus = useReturnFocus();
  const { state, removeAttempt, togglePermission, notify } = useCoursemap();
  const catalogue = suppliedCatalogue
    ? {
        ...suppliedCatalogue,
        ...(preview ? { evaluationContext: "whole-plan" as const } : {}),
        commencementYear: state.profile.commencementYear ?? null,
        enrolmentMode: state.profile.enrolmentMode ?? null,
        programmeCodes: state.profile.degreeCode
          ? [state.profile.degreeCode]
          : [],
        structureCodes: planStructureCodes(state.profile),
      }
    : undefined;
  // A preview reads as a course placed after everything already planned,
  // so its requisites are checked against the whole plan.
  const attempt: Attempt | undefined = preview
    ? {
        id: "preview",
        academicYear: preview.course.year,
        courseCode: preview.course.code,
        termId: "",
        status: "planned",
      }
    : state.attempts.find((item) => item.id === attemptId);
  const course = preview
    ? preview.course
    : attempt
      ? planningCourseForAttempt(attempt, catalogue)
      : undefined;
  const status = attempt
    ? effectiveStatus(attempt, state.attempts, catalogue)
    : "planned";

  const details = useCourseDetails(course?.code ?? null, course?.year ?? 0);

  if (!attempt || !course) return null;

  const missing = new Set(missingPrereqs(attempt, state.attempts, catalogue));
  const prereqsMet = missing.size === 0;
  // Once a course has a result or enrolment the plan order no longer matters.
  const prereqWarning = !prereqsMet && !preview && attempt.status === "planned";
  const recorded = attempt.status !== "planned";
  const enrolled = attempt.status === "enrolled";
  /** A result or withdrawal is history and stays put; an enrolment can go. */
  const final = recorded && !enrolled;
  const coursePage = `/courses/${course.year}/${course.code.toLowerCase()}`;
  const sessions = [...new Set(course.sessions)];
  const placedTerm = preview ? undefined : termForAttempt(attempt, catalogue);
  const dependents = preview
    ? []
    : plannedDependents(course.code, state.attempts, catalogue);
  const incompatibleCodes = [
    ...new Set(course.incompatibilities.join(" ").match(COURSE_CODE) ?? []),
  ];
  const prerequisite = course.prerequisiteRule?.relationalExpression ?? null;
  const incompatibility =
    course.incompatibilityRule?.relationalExpression ?? null;
  const rule: CourseRuleExpression | null = incompatibility
    ? {
        kind: "group",
        operator: "all_of",
        minimumCount: null,
        conditions: [...(prerequisite ? [prerequisite] : []), incompatibility],
      }
    : prerequisite;
  const permissions = [
    ...new Set([
      ...(course.permissionText ? [course.permissionText] : []),
      ...permissionClauses(rule),
    ]),
  ];
  const student = planStudentRecord(
    attempt,
    state.attempts,
    state.profile,
    state.profile.commencementYear ?? null,
    catalogue,
  );
  const split = splitRequisiteRule(prerequisite);
  const requirements = split.requirements;
  // Clauses the importer could not model stay visible, marked as unchecked.
  const uncheckedNotes = split.notes;
  // An exclusion with a way around it, such as "unless approved", stays a rule.
  const excludedRules = splitRequisiteRule(incompatibility).requirements;
  const excluded = [
    ...new Set([
      ...splitRequisiteRule(incompatibility).incompatible,
      ...split.incompatible,
      ...(rule ? [] : incompatibleCodes),
    ]),
  ];
  // Ticks only mean something while the course is still being planned.
  const checkedStudent = recorded ? null : student;
  const hasPrerequisiteWording =
    course.prerequisiteText.trim().length > 0 &&
    !/^No prerequisites listed\.?$/iu.test(course.prerequisiteText.trim());
  const remove = async () => {
    const result = await removeAttempt(attempt.id);
    notify(result.message, result.ok ? "success" : "error");
    if (result.ok) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        {...restoreFocus}
        showCloseButton={false}
        aria-labelledby={"course-dialog-title"}
        aria-describedby={undefined}
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] min-h-[min(24rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="font-mono text-[11px] font-medium text-muted-foreground">
                {course.code}
              </p>
              {preview ? (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Not in your plan
                </span>
              ) : (
                <StatusPill status={status} />
              )}
            </div>
            <DialogTitle asChild>
              <h2
                id="course-dialog-title"
                className="mt-1.5 text-xl leading-tight font-semibold tracking-tight text-foreground"
              >
                {course.name}
              </h2>
            </DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {unitsForAttempt(attempt, course)} units · Level {course.level}
              {course.sessions.length
                ? ` · ${[...new Set(course.sessions.map(shortSession))].join(", ")}`
                : " · Not offered this year"}
            </p>
          </div>
          <StarButton courseCode={course.code} />
          <Button
            onClick={onClose}
            variant="ghost"
            aria-label={"Close course details"}
            title={"Close course details"}
            size="icon-sm"
            type="button"
          >
            <X size={16} />
          </Button>
        </header>

        {prereqWarning ? (
          <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700 sm:mx-6 dark:bg-rose-950/60 dark:text-rose-300">
            <AlertTriangle size={14} className="shrink-0" />
            <p className="min-w-0 flex-1 text-xs font-medium">
              Prerequisites aren&apos;t planned before this yet
            </p>
            <FixIssueButton attempt={attempt} catalogue={catalogue} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-5 py-4 sm:px-6">
          <CourseAbout course={course} details={details}>
            <dl className="divide-y divide-border border-y border-border text-[13px]">
              <FactRow label="Offered">
                {sessions.length === 0 ? (
                  <span className="text-muted-foreground">
                    Not offered this year
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {sessions.map((session) =>
                      placedTerm?.name === session ? (
                        <span
                          key={session}
                          className="inline-flex items-center gap-1 font-medium text-primary"
                        >
                          <Check
                            size={13}
                            strokeWidth={2.5}
                            aria-hidden="true"
                          />
                          {shortSession(session)}
                          <span className="font-normal text-muted-foreground">
                            in your plan
                          </span>
                        </span>
                      ) : (
                        <span key={session} className="text-foreground">
                          {shortSession(session)}
                        </span>
                      ),
                    )}
                    {placedTerm && !sessions.includes(placedTerm.name) ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={13} aria-hidden="true" />
                        Not offered in {placedTerm.shortName}
                      </span>
                    ) : null}
                  </span>
                )}
              </FactRow>

              <FactRow label="Requires">
                {requirements.length > 0 || uncheckedNotes.length > 0 ? (
                  <span className="flex flex-col items-start gap-2">
                    {requirements.map((node, index) => (
                      <RequirementChips
                        key={index}
                        node={node}
                        student={checkedStudent}
                      />
                    ))}
                    {uncheckedNotes.map((text) => (
                      <span
                        key={text}
                        className="inline-flex items-start gap-1.5 text-xs whitespace-pre-line text-foreground/85"
                      >
                        <span className="mt-0.5">
                          <UncheckedMark />
                        </span>
                        {text}
                      </span>
                    ))}
                  </span>
                ) : !prerequisite && course.prerequisiteCodes.length > 0 ? (
                  <span className="flex flex-col items-start gap-1.5">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {course.prerequisiteCodes.length > 1 &&
                      /\bor\b/i.test(course.prerequisiteText) &&
                      !/\band\b/i.test(course.prerequisiteText) ? (
                        <span className="text-xs text-muted-foreground">
                          one of
                        </span>
                      ) : null}
                      {course.prerequisiteCodes.map((code) => (
                        <PlanCodeChip
                          key={code}
                          code={code}
                          student={checkedStudent}
                        />
                      ))}
                    </span>
                  </span>
                ) : hasPrerequisiteWording ? (
                  <span className="text-xs text-muted-foreground">
                    {course.prerequisiteText}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Nothing</span>
                )}
              </FactRow>

              {split.soft.length > 0 ? (
                <FactRow label="Also">
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {split.soft.map((node, index) => (
                      <li key={index}>
                        <span className="font-medium text-foreground">
                          {softRequirementLabel(node)}:
                        </span>{" "}
                        {node.kind === "group"
                          ? groupSentence(node)
                          : node.kind === "other"
                            ? standaloneWording(node.text)
                            : requisiteSentence(node)}
                      </li>
                    ))}
                  </ul>
                </FactRow>
              ) : null}

              {excluded.length > 0 || excludedRules.length > 0 ? (
                <FactRow label="Can't take with">
                  <span className="flex flex-col items-start gap-2">
                    {excluded.length > 0 ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {excluded.map((code) => (
                          <CodeChip key={code} tone="neutral">
                            {code}
                          </CodeChip>
                        ))}
                      </span>
                    ) : null}
                    {excludedRules.map((node, index) => (
                      <RequirementChips
                        key={index}
                        node={node}
                        student={checkedStudent}
                      />
                    ))}
                  </span>
                </FactRow>
              ) : null}

              {permissions.length > 0 ? (
                <FactRow label="Permission">
                  <p className="text-xs whitespace-pre-line text-muted-foreground">
                    {permissions.join("\n\n")}
                  </p>
                  {preview ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 -ml-2 h-7 px-2 text-xs text-primary hover:text-primary"
                      onClick={() => {
                        togglePermission(attempt.id);
                        notify(
                          attempt.permissionApproved
                            ? "Permission approval removed"
                            : "Permission approval recorded",
                        );
                      }}
                      type="button"
                    >
                      {attempt.permissionApproved ? (
                        <ShieldCheck size={13} aria-hidden="true" />
                      ) : null}
                      {attempt.permissionApproved
                        ? "Remove approval"
                        : "Record approval"}
                    </Button>
                  )}
                </FactRow>
              ) : null}

              {dependents.length > 0 ? (
                <FactRow label="Unlocks">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {dependents.map((code) => (
                      <CodeChip key={code} tone="neutral">
                        {code}
                      </CodeChip>
                    ))}
                    <span className="text-xs text-muted-foreground">
                      in your plan
                    </span>
                  </span>
                </FactRow>
              ) : null}

              {course.countsTowards.length > 0 ? (
                <FactRow label="Counts towards">
                  <span className="text-foreground">
                    {course.countsTowards.join(", ")}
                  </span>
                </FactRow>
              ) : null}
            </dl>
          </CourseAbout>
        </div>

        <footer className="border-t border-border/60 bg-muted/40 px-5 py-3 sm:px-6">
          {preview ? (
            <div className="flex justify-end gap-2">
              <Button asChild variant="outline" size="sm">
                <ReuiLink href={coursePage}>
                  Full course page
                  <ExternalLink size={14} aria-hidden="true" />
                </ReuiLink>
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  preview.onAdd();
                  onClose();
                }}
              >
                <Plus size={14} aria-hidden="true" />
                {preview.addLabel}
              </Button>
            </div>
          ) : final ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <p className="mr-auto">Result recorded</p>
              <Button asChild variant="ghost" size="sm">
                <ReuiLink href="/academic">Edit in academic history</ReuiLink>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove()}
                className="mr-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/60"
                type="button"
              >
                <Trash2 size={14} />
                Remove
              </Button>
              {enrolled ? (
                <Button asChild variant="outline" size="sm">
                  <ReuiLink href="/academic">Add result</ReuiLink>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <ReuiLink href={coursePage}>
                  Full course page
                  <ExternalLink size={14} aria-hidden="true" />
                </ReuiLink>
              </Button>
            </div>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
