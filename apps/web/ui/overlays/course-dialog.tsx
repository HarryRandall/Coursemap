"use client";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Field,
  FieldError,
  FieldDescription,
} from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";
import { OptionPicker } from "@/ui/common/option-picker";
import ReuiLink from "next/link";
import { cn } from "@/lib/cn";

import {
  AlertTriangle,
  Check,
  ExternalLink,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import { useCoursemap } from "@/app/providers";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import {
  attemptedUnitsError,
  attemptedUnitsFromInput,
  attemptUnitRequirement,
} from "@/lib/coursemap/attempt-units";
import {
  effectiveStatus,
  isActiveAttempt,
  missingPrereqs,
  planningCourseForAttempt,
  termIndex,
  unitsForAttempt,
} from "@/lib/planner";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import { EnrolmentSteps } from "@/ui/courses/enrolment-steps";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";

import { StatusPill } from "@/ui/common/status-pill";
import { StarButton } from "@/ui/common/star-button";
import { FixIssueButton } from "@/ui/plan/fix-issue-button";

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
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
  degreeCode: string,
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
    programmeCodes: degreeCode ? [degreeCode] : [],
    wam: null,
    gpa: null,
    studyYear: null,
  };
}

/**
 * A planned or recorded course: the key facts up top, its description and
 * requisites a tab apart, and the result actions along the bottom. A missing
 * prerequisite shows above the tabs so it is seen without looking for it.
 */
export function CourseDialog({
  attemptId,
  catalogue,
  onClose,
}: {
  attemptId: string;
  catalogue?: PlanCatalogue;
  onClose: () => void;
}) {
  const restoreFocus = useReturnFocus();
  const { state, updateAttempt, removeAttempt, togglePermission, notify } =
    useCoursemap();
  const attempt = state.attempts.find((item) => item.id === attemptId);
  const course = attempt
    ? planningCourseForAttempt(attempt, catalogue)
    : undefined;
  const [attemptedUnitsInput, setAttemptedUnitsInput] = useState(() =>
    attempt?.unitsAttempted === undefined ? "" : String(attempt.unitsAttempted),
  );
  const [showFullDescription, setShowFullDescription] = useState(false);
  const unitRequirement = course ? attemptUnitRequirement(course) : null;
  const status = attempt
    ? effectiveStatus(attempt, state.attempts, catalogue)
    : "planned";

  if (!attempt || !course || !unitRequirement) return null;

  const missing = new Set(missingPrereqs(attempt, state.attempts, catalogue));
  const prereqsMet = missing.size === 0;
  const recorded = attempt.status !== "planned";
  const enrolled = attempt.status === "enrolled";
  /** A result or withdrawal is history and stays put; an enrolment can go. */
  const final = recorded && !enrolled;
  const selectedAttemptedUnits = attemptedUnitsFromInput(
    unitRequirement,
    attemptedUnitsInput,
  );
  const unitError = attemptedUnitsError(unitRequirement, attemptedUnitsInput);
  const unitSelectionRequired = unitRequirement.kind !== "fixed";
  const unitSelectionMissing =
    unitSelectionRequired && selectedAttemptedUnits === null;
  const submittedAttemptedUnits = unitSelectionRequired
    ? (selectedAttemptedUnits ?? undefined)
    : undefined;
  const showUnits = !recorded && unitSelectionRequired;
  const facts = [
    ["Units", String(unitsForAttempt(attempt, course))],
    ["Level", String(course.level)],
    [
      "Offered",
      [...new Set(course.sessions)].join(", ") || "Not listed this year",
    ],
    ["Delivery", course.delivery],
    [
      "Cost",
      course.domesticFee != null
        ? `${AUD.format(course.domesticFee)} domestic`
        : "Not listed",
    ],
    ["Convener", course.convener],
    ["Counts towards", course.countsTowards.join(", ")],
  ].filter(([, value]) => value);
  const incompatibleCodes = [
    ...new Set(course.incompatibilities.join(" ").match(COURSE_CODE) ?? []),
  ];
  const availableCodes = new Set(
    (catalogue?.courses ?? []).map((item) => item.code),
  );
  const rule = course.prerequisiteRule?.relationalExpression ?? null;
  const student = rule
    ? planStudentRecord(
        attempt,
        state.attempts,
        state.profile.degreeCode,
        catalogue,
      )
    : null;
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
        className="flex h-[min(38rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="font-mono text-[11px] font-medium text-muted-foreground">
                {course.code}
              </p>
              <StatusPill status={status} />
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
                : ""}
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

        {!prereqsMet ? (
          <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700 sm:mx-6 dark:bg-rose-950/60 dark:text-rose-300">
            <AlertTriangle size={14} className="shrink-0" />
            <p className="min-w-0 flex-1 text-xs font-medium">
              Prerequisites aren&apos;t planned before this yet
            </p>
            <FixIssueButton attempt={attempt} catalogue={catalogue} />
          </div>
        ) : null}

        <Tabs
          defaultValue="about"
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList variant="line" className="mx-5 sm:mx-6">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="requisites">
              Requisites
              {!prereqsMet ? (
                <span
                  aria-label="needs attention"
                  className="size-1.5 rounded-full bg-rose-500"
                />
              ) : null}
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-5 py-4 sm:px-6">
            <TabsContent value="about" className="mt-0 space-y-4">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border sm:grid-cols-3">
                {facts.map(([label, value]) => (
                  <div key={label} className="min-w-0 bg-card px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-[13px] font-medium text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div>
                <p
                  className={cn(
                    "text-[13px] leading-relaxed text-muted-foreground",
                    !showFullDescription && "line-clamp-3",
                  )}
                >
                  {course.description}
                </p>
                <div className="mt-1.5 flex items-center gap-4 text-xs font-medium">
                  {course.description.length > 220 ? (
                    <button
                      type="button"
                      className="text-primary"
                      onClick={() => setShowFullDescription((open) => !open)}
                    >
                      {showFullDescription ? "Show less" : "Read more"}
                    </button>
                  ) : null}
                  <ReuiLink
                    href={`/courses/${course.year}/${course.code.toLowerCase()}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Full course page
                    <ExternalLink size={12} aria-hidden="true" />
                  </ReuiLink>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="requisites" className="mt-0 space-y-4">
              {rule ? (
                <div className="-mx-5 -my-4 sm:-mx-6">
                  <EnrolmentSteps
                    academicYear={course.year}
                    availableCourseCodes={availableCodes}
                    expression={rule}
                    student={student}
                  />
                </div>
              ) : (
                <section>
                  <h3 className="text-xs font-semibold text-foreground">
                    Needs first
                  </h3>
                  {course.prerequisiteCodes.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {course.prerequisiteCodes.map((code) => (
                        <span
                          key={code}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-inset",
                            !missing.has(code)
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900"
                              : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
                          )}
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {course.prerequisiteText || "No prerequisites."}
                  </p>
                </section>
              )}

              {!rule && incompatibleCodes.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-foreground">
                    Can&apos;t take with
                  </h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {incompatibleCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {course.permissionText && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck
                      size={13}
                      aria-hidden="true"
                      className={
                        attempt.permissionApproved
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-primary"
                      }
                    />
                    Permission code
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {course.permissionText}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 -ml-2 h-7 px-2 text-[11px] text-primary hover:text-primary"
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
                    {attempt.permissionApproved
                      ? "Remove approval"
                      : "Record approval"}
                  </Button>
                </section>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {showUnits ? (
          <div className="border-t border-border px-5 pt-3 sm:px-6">
            {!recorded && unitRequirement.kind === "unavailable" ? (
              <Alert className="mb-3" variant={"warning"}>
                <AlertDescription>
                  This course cannot be added to your plan yet.
                </AlertDescription>
              </Alert>
            ) : null}
            {!recorded &&
            unitSelectionRequired &&
            unitRequirement.kind !== "unavailable" ? (
              <section className="pb-3">
                <Field>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium">
                      {"Units attempted"}
                    </span>
                    {unitRequirement.kind === "choice" ? (
                      <OptionPicker
                        value={"coursemap:" + String(attemptedUnitsInput)}
                        onValueChange={(nextValue) => {
                          const option = unitRequirement.options
                            .map((option) => ({
                              label: option.label
                                ? `${option.units} units · ${option.label}`
                                : `${option.units} units`,
                              value: String(option.units),
                            }))
                            .find(
                              (option) =>
                                "coursemap:" + String(option.value) ===
                                nextValue,
                            );
                          if (option) setAttemptedUnitsInput(option.value);
                        }}
                        aria-label={"Units attempted"}
                        onPointerDown={(event) => event.stopPropagation()}
                        placeholder={"Choose units"}
                        items={unitRequirement.options
                          .map((option) => ({
                            label: option.label
                              ? `${option.units} units · ${option.label}`
                              : `${option.units} units`,
                            value: String(option.units),
                          }))
                          .map((option) => ({
                            value: "coursemap:" + String(option.value),
                            label: option.label,
                          }))}
                      />
                    ) : (
                      <Input
                        aria-invalid={unitError ? true : undefined}
                        inputMode="decimal"
                        max={
                          unitRequirement.kind === "range"
                            ? unitRequirement.maximumUnits
                            : 999.99
                        }
                        min={
                          unitRequirement.kind === "range"
                            ? unitRequirement.minimumUnits
                            : 0.01
                        }
                        onChange={(event) =>
                          setAttemptedUnitsInput(event.target.value)
                        }
                        placeholder="Enter units"
                        step="0.01"
                        type="number"
                        value={attemptedUnitsInput}
                      />
                    )}
                    {unitError ? <FieldError>{unitError}</FieldError> : null}
                    <FieldDescription>
                      {unitRequirement.kind === "range"
                        ? `Published range: ${unitRequirement.minimumUnits} to ${unitRequirement.maximumUnits} units.`
                        : unitRequirement.kind === "choice"
                          ? "Choose the published unit value you attempted."
                          : null}
                    </FieldDescription>
                  </label>
                </Field>
              </section>
            ) : null}
          </div>
        ) : null}
        <footer className="border-t border-border/60 bg-muted/40 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={final}
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
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recorded || unitSelectionMissing}
                  aria-pressed={attempt.status === "completed"}
                  className={cn(
                    attempt.status === "completed"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 disabled:opacity-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                      : "hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-200",
                  )}
                  onClick={async () => {
                    const result = await updateAttempt(
                      attempt.id,
                      "completed",
                      undefined,
                      submittedAttemptedUnits,
                    );
                    notify(
                      result.ok
                        ? `${course.code} marked as completed`
                        : result.message,
                      result.ok ? "success" : "error",
                    );
                  }}
                  type="button"
                >
                  <Check size={14} />
                  Completed
                </Button>
                <Button
                  variant={
                    attempt.status === "failed" ? "destructive" : "outline"
                  }
                  size="sm"
                  disabled={recorded || unitSelectionMissing}
                  aria-pressed={attempt.status === "failed"}
                  className={cn(
                    attempt.status === "failed"
                      ? "disabled:opacity-100"
                      : "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 dark:hover:border-rose-800 dark:hover:bg-rose-950/60 dark:hover:text-rose-200",
                  )}
                  onClick={async () => {
                    const result = await updateAttempt(
                      attempt.id,
                      "failed",
                      undefined,
                      submittedAttemptedUnits,
                    );
                    notify(
                      result.ok
                        ? `${course.code} marked as failed`
                        : result.message,
                      result.ok ? "success" : "error",
                    );
                  }}
                  type="button"
                >
                  <X size={14} />
                  Failed
                </Button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
