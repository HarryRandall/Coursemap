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
  BookMarked,
  CalendarDays,
  Check,
  ExternalLink,
  Info,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";

import { useCoursemap } from "@/app/providers";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import {
  attemptedUnitsError,
  attemptedUnitsFromInput,
  attemptUnitRequirement,
} from "@/lib/coursemap/attempt-units";
import {
  effectiveStatus,
  missingPrereqs,
  planningCourseForAttempt,
  unitsForAttempt,
} from "@/lib/planner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@coursemap/ui/primitives/sheet";

import { StatusPill } from "@/ui/common/status-pill";
import { FixIssueButton } from "@/ui/plan/fix-issue-button";

export function CourseDrawer({
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
  const unitRequirement = course ? attemptUnitRequirement(course) : null;
  const status = attempt
    ? effectiveStatus(attempt, state.attempts, catalogue)
    : "planned";

  if (!attempt || !course || !unitRequirement) return null;

  const missing = new Set(missingPrereqs(attempt, state.attempts, catalogue));
  const prereqsMet = missing.size === 0;
  const recorded = attempt.status !== "planned";
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
  const remove = async () => {
    const result = await removeAttempt(attempt.id);
    notify(result.message, result.ok ? "success" : "error");
    if (result.ok) onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        {...restoreFocus}
        showCloseButton={false}
        aria-labelledby={"drawer-title"}
        aria-describedby={undefined}
        className={"flex flex-col"}
      >
        <Button
          onClick={onClose}
          className="absolute top-4 right-4 z-10"
          variant="outline"
          aria-label={"Close course details"}
          title={"Close course details"}
          size="icon"
          type="button"
        >
          <X size={18} />
        </Button>

        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6">
          <div className="flex min-w-0 items-center gap-2 pr-12">
            <p className="font-mono text-[11px] font-medium text-muted-foreground/80">
              {course.code}
            </p>
            <StatusPill status={status} />
          </div>
          <SheetTitle asChild>
            <h2
              id="drawer-title"
              className="mt-3 text-2xl leading-tight font-bold tracking-tight text-foreground"
            >
              {course.name}
            </h2>
          </SheetTitle>

          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {course.description}
          </p>

          <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl ring-1 ring-border">
            {[
              ["Units", String(unitsForAttempt(attempt, course))],
              ["Level", String(course.level)],
              [
                "Offered",
                course.sessions
                  .map((item) => item.replace("Semester ", "S"))
                  .join(" · "),
              ],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 px-3 py-2.5">
                <p className="text-[10px] tracking-wide text-muted-foreground/80 uppercase">
                  {label}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-semibold text-foreground/90">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 divide-y divide-border rounded-xl ring-1 ring-border">
            {[
              [<UserRound key="i" size={16} />, "Convener", course.convener],
              [<CalendarDays key="i" size={16} />, "Delivery", course.delivery],
              [
                <BookMarked key="i" size={16} />,
                "Counts towards",
                course.countsTowards.join(", "),
              ],
            ].map(([icon, label, value], index) => (
              <div
                key={index}
                className="grid grid-cols-[1.25rem_5rem_1fr] items-center gap-2.5 px-3 py-3"
              >
                <span className="text-muted-foreground/80">{icon}</span>
                <span className="text-xs text-muted-foreground/80">
                  {label}
                </span>
                <span className="text-xs font-medium text-foreground/80">
                  {value}
                </span>
              </div>
            ))}
          </div>

          <Button
            asChild
            variant="outline"
            size="default"
            className="mt-3 !h-auto w-full justify-between px-3 py-2.5 text-left"
          >
            <ReuiLink
              href={`/courses/${course.year}/${course.code.toLowerCase()}`}
            >
              <span className="min-w-0 whitespace-normal">
                <span className="block text-xs font-semibold text-foreground/90">
                  More course information
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed font-normal text-muted-foreground">
                  View assessment, learning outcomes and the complete course
                  record.
                </span>
              </span>
              <ExternalLink
                size={14}
                className="shrink-0 text-muted-foreground/80"
              />
            </ReuiLink>
          </Button>

          {!recorded && unitRequirement.kind === "unavailable" ? (
            <Alert className="mt-5" variant={"warning"}>
              <AlertDescription>
                This course cannot be added to your plan yet.
              </AlertDescription>
            </Alert>
          ) : null}

          {!recorded &&
          unitSelectionRequired &&
          unitRequirement.kind !== "unavailable" ? (
            <section className="mt-5 border-t border-border/60 pt-5">
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
                              "coursemap:" + String(option.value) === nextValue,
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

          <section className="mt-5 border-t border-border/60 pt-5">
            <h3 className="text-[13px] font-semibold text-foreground">
              Requisites
            </h3>

            <div className="mt-3 divide-y divide-border/60 overflow-hidden rounded-xl ring-1 ring-border">
              <div className="flex gap-3 p-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    prereqsMet
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
                  )}
                >
                  {prereqsMet ? (
                    <BookMarked size={17} />
                  ) : (
                    <AlertTriangle size={17} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground/90">
                    Prerequisite
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {course.prerequisiteText}
                  </p>
                  {course.prerequisiteCodes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {course.prerequisiteCodes.map((code) => (
                        <span
                          key={code}
                          className={cn(
                            "rounded-md px-1.5 py-1 font-mono text-[10px] ring-1 ring-inset",
                            !missing.has(code)
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900"
                              : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
                          )}
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                  {!prereqsMet && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-2.5 py-2 text-rose-700 ring-1 ring-rose-100 ring-inset dark:bg-rose-950/60 dark:text-rose-300">
                        <Info size={14} className="shrink-0" />
                        <p className="text-[11px] leading-snug font-medium">
                          {[...missing].join(" + ")} must be completed or
                          planned earlier
                        </p>
                      </div>
                      <FixIssueButton attempt={attempt} catalogue={catalogue} />
                    </div>
                  )}
                </div>
              </div>

              {course.incompatibilities.length > 0 && (
                <div className="flex gap-3 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <X size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground/90">
                      Incompatible with
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {course.incompatibilities.join(", ")}
                    </p>
                  </div>
                </div>
              )}

              {course.permissionText && (
                <div className="flex gap-3 bg-primary/5 p-3">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      attempt.permissionApproved
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-primary/15 text-primary",
                    )}
                  >
                    <ShieldCheck size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground/90">
                      Permission code
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="border-t border-border/60 bg-card px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={recorded || unitSelectionMissing}
              aria-pressed={attempt.status === "completed"}
              className={cn(
                "w-full",
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
              variant={attempt.status === "failed" ? "destructive" : "outline"}
              size="sm"
              disabled={recorded || unitSelectionMissing}
              aria-pressed={attempt.status === "failed"}
              className={cn(
                "w-full",
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
            <Button
              variant="destructive"
              size="sm"
              disabled={recorded}
              onClick={() => void remove()}
              className="w-full"
              type="button"
            >
              <Trash2 size={14} />
              Remove
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
