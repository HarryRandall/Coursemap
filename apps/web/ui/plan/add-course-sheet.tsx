"use client";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { cn } from "@/lib/cn";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  groupOperator,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";
import type { TermPlacement } from "@/lib/coursemap/term-placement";
import type { Course, Term } from "@/lib/coursemap/types";
import { OVERLOAD_PERMISSION_UNITS, STANDARD_TERM_UNITS } from "@/lib/planner";
import { CodeChip } from "@/ui/common/code-chip";
import {
  groupSentence,
  requisiteSentence,
  splitRequisiteRule,
} from "@/ui/courses/requisite-wording";
import {
  RequirementChips,
  UncheckedMark,
} from "@/ui/overlays/requirement-chips";

/** Semesters shown before the rest fold behind "Later semesters". */
const SHOWN_TERMS = 4;

function termLabel(term: Term) {
  return `${sessionShortName(term.name)} ${term.year}`;
}

/** The courses a requirement accepts, when it is only a choice of courses. */
function courseChoices(node: CourseRuleExpression): string[] | null {
  if (node.kind === "course") return [node.code];
  if (
    node.kind === "group" &&
    groupOperator(node) === "any_of" &&
    node.conditions.every((child) => child.kind === "course")
  )
    return node.conditions.flatMap((child) =>
      child.kind === "course" ? [child.code] : [],
    );
  return null;
}

/** One sentence on the chosen semester: the first thing that stands in its way, or its load. */
function placementNote(placement: TermPlacement) {
  const label = termLabel(placement.term);
  if (placement.needsPermission)
    return {
      warn: true,
      text: `That takes ${label} to ${placement.unitsAfter} units. Above ${OVERLOAD_PERMISSION_UNITS}, you'll need permission from your college.`,
    };
  if (placement.overload)
    return {
      warn: true,
      text: `That takes ${label} to ${placement.unitsAfter} units, more than a full-time load of ${STANDARD_TERM_UNITS}.`,
    };
  if (placement.prerequisites === "missing")
    return {
      warn: true,
      text: `Its prerequisites aren't planned before ${label} yet.`,
    };
  return {
    warn: false,
    text: `${label} would have ${placement.unitsAfter} of ${STANDARD_TERM_UNITS} units.`,
  };
}

/**
 * Asks where a course goes before it is added: the semesters that run it,
 * each with its load, and only the prerequisites still missing before the
 * chosen one. A missing course can be added from here, which opens the same
 * sheet for it on top of this one. The full rule stays one click away.
 */
export function AddCourseSheet({
  course,
  placements,
  initialTermId,
  studentFor,
  findCourse,
  parentCode,
  onAdd,
  onAddPrerequisite,
  onClose,
}: {
  course: Course;
  placements: readonly TermPlacement[];
  initialTermId: string | null;
  /** The plan as a student record for the course placed in a term. */
  studentFor: (termId: string) => StudentRecord;
  findCourse: (code: string) => Course | undefined;
  /** The course this one was opened from as its prerequisite. */
  parentCode?: string;
  onAdd: (termId: string) => void;
  onAddPrerequisite: (course: Course) => void;
  onClose: () => void;
}) {
  const restoreFocus = useReturnFocus();
  const [termId, setTermId] = useState(initialTermId);
  const [showLater, setShowLater] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const offered = placements.filter((placement) => placement.offered);
  const selected = offered.find((placement) => placement.term.id === termId);
  const selectedIndex = selected ? offered.indexOf(selected) : -1;
  const shownTerms =
    showLater || selectedIndex >= SHOWN_TERMS
      ? offered
      : offered.slice(0, SHOWN_TERMS);
  const prerequisite = course.prerequisiteRule?.relationalExpression ?? null;
  const requirements = splitRequisiteRule(prerequisite).requirements;
  const student = selected ? studentFor(selected.term.id) : null;
  const unmet = student
    ? requirements.filter(
        (node) => evaluateRule(node, student).status !== "met",
      )
    : requirements;
  // Older imports list prerequisite codes without a structured rule, and
  // each listed course is then required.
  const needed: Array<{ codes: string[] } | { text: string }> =
    requirements.length > 0
      ? unmet.map((node) => {
          const codes = courseChoices(node);
          return codes
            ? { codes }
            : {
                text:
                  node.kind === "group"
                    ? groupSentence(node)
                    : requisiteSentence(node),
              };
        })
      : (selected?.missingCodes ?? []).map((code) => ({ codes: [code] }));
  const hasPrerequisites =
    requirements.length > 0 || course.prerequisiteCodes.length > 0;
  const sessions = [
    ...new Set(course.sessions.map((session) => sessionShortName(session))),
  ];
  const note = selected ? placementNote(selected) : null;
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
        aria-labelledby="add-course-title"
        aria-describedby={undefined}
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            {parentCode ? (
              <button
                type="button"
                onClick={onClose}
                className="mb-2 -ml-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft size={12} aria-hidden="true" />
                Prerequisite for {parentCode}
              </button>
            ) : null}
            <p className="font-mono text-[11px] font-medium text-muted-foreground">
              {course.code}
            </p>
            <DialogTitle asChild>
              <h2
                id="add-course-title"
                className="mt-1 text-lg leading-tight font-semibold tracking-tight text-foreground"
              >
                {course.name}
              </h2>
            </DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {course.units} units
              {sessions.length > 0
                ? ` · Runs in ${sessions.join(" and ")}`
                : " · Not scheduled yet"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
          {offered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {course.code} doesn&apos;t run in any semester left in your plan.
            </p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">
                Add to
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {shownTerms.map((placement) => {
                  const on = placement.term.id === termId;
                  return (
                    <label
                      key={placement.term.id}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        on
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        name="add-course-term"
                        value={placement.term.id}
                        checked={on}
                        onChange={() => setTermId(placement.term.id)}
                        className="sr-only"
                      />
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {termLabel(placement.term)}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            on && placement.overload
                              ? "font-medium text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {on ? placement.unitsAfter : placement.currentUnits} /{" "}
                          {STANDARD_TERM_UNITS}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="flex h-1 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className="h-full bg-muted-foreground/50"
                          style={{
                            width: `${Math.min(100, (placement.currentUnits / STANDARD_TERM_UNITS) * 100)}%`,
                          }}
                        />
                        {on ? (
                          <span
                            className={cn(
                              "h-full",
                              placement.overload
                                ? "bg-amber-500"
                                : "bg-primary",
                            )}
                            style={{
                              width: `${Math.max(0, Math.min(100, (placement.unitsAfter / STANDARD_TERM_UNITS) * 100) - Math.min(100, (placement.currentUnits / STANDARD_TERM_UNITS) * 100))}%`,
                            }}
                          />
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {shownTerms.length < offered.length ? (
                <button
                  type="button"
                  onClick={() => setShowLater(true)}
                  className="mt-2 flex cursor-pointer items-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Later semesters
                  <ChevronDown size={12} aria-hidden="true" />
                </button>
              ) : null}
              {note ? (
                <p
                  className={cn(
                    "mt-3 flex items-start gap-2 text-xs",
                    note.warn
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                >
                  {note.warn ? (
                    <TriangleAlert
                      size={14}
                      aria-hidden="true"
                      className="mt-px shrink-0"
                    />
                  ) : null}
                  {note.text}
                </p>
              ) : null}
            </fieldset>
          )}

          {hasPrerequisites && selected ? (
            <section aria-labelledby="add-course-prerequisites">
              {needed.length === 0 && selected.prerequisites !== "unknown" ? (
                <p
                  id="add-course-prerequisites"
                  className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  Prerequisites done before {termLabel(selected.term)}
                </p>
              ) : (
                <>
                  <h3
                    id="add-course-prerequisites"
                    className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground"
                  >
                    <CircleAlert
                      size={14}
                      aria-hidden="true"
                      className="text-amber-600 dark:text-amber-400"
                    />
                    Still needed before {termLabel(selected.term)}
                  </h3>
                  <ul className="space-y-2 pl-[1.375rem]">
                    {needed.map((item, index) => {
                      const codes = "codes" in item ? item.codes : null;
                      return (
                        <li
                          key={index}
                          className="flex flex-wrap items-center gap-1.5 text-xs"
                        >
                          {codes ? (
                            <>
                              {codes.length > 1 ? (
                                <span className="mr-0.5 text-muted-foreground">
                                  One of
                                </span>
                              ) : null}
                              {codes.map((code) => {
                                const found = findCourse(code);
                                return found ? (
                                  <Button
                                    key={code}
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    title={found.name}
                                    aria-label={`Add ${code} first`}
                                    onClick={() => onAddPrerequisite(found)}
                                  >
                                    <Plus aria-hidden="true" />
                                    <span className="font-mono">{code}</span>
                                  </Button>
                                ) : (
                                  <CodeChip key={code} tone="neutral">
                                    {code}
                                  </CodeChip>
                                );
                              })}
                            </>
                          ) : (
                            <span className="text-foreground/85">
                              {"text" in item ? item.text : null}
                            </span>
                          )}
                        </li>
                      );
                    })}
                    {needed.length === 0 ? (
                      <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-0.5">
                          <UncheckedMark />
                        </span>
                        {course.prerequisiteText}
                      </li>
                    ) : null}
                  </ul>
                </>
              )}
              {requirements.length > 0 ? (
                <button
                  type="button"
                  aria-expanded={showRule}
                  onClick={() => setShowRule((value) => !value)}
                  className="mt-2 flex cursor-pointer items-center gap-1 rounded-md pl-[1.375rem] text-[11px] text-muted-foreground transition hover:text-foreground"
                >
                  {showRule ? "Hide full rule" : "Show full rule"}
                  <ChevronDown
                    size={12}
                    aria-hidden="true"
                    className={cn(showRule && "rotate-180")}
                  />
                </button>
              ) : null}
              {showRule ? (
                <div className="mt-2 flex flex-col items-start gap-2 rounded-lg bg-muted/40 p-3">
                  {requirements.map((node, index) => (
                    <RequirementChips
                      key={index}
                      node={node}
                      student={student}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected}
            onClick={() => selected && onAdd(selected.term.id)}
          >
            {selected
              ? `${selected.overload ? "Add anyway to" : "Add to"} ${termLabel(selected.term)}`
              : "Choose a semester"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
