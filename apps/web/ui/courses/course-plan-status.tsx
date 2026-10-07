import Link from "next/link";
import { CalendarCheck, CheckCircle2, Plus, XCircle } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { STANDARD_ACADEMIC_PERIODS } from "@/lib/coursemap/academic-periods";
import type { Attempt } from "@/lib/coursemap/types";

/** "2026-s1" as "S1 2026", or "Not scheduled yet" for the unscheduled lane. */
function periodLabel(termId: string) {
  const match = /^(\d{4})-(.+)$/u.exec(termId);
  if (!match) return "Not scheduled yet";
  const period = STANDARD_ACADEMIC_PERIODS.find(
    (item) => item.code.toLowerCase() === match[2],
  );
  return `${period?.shortName ?? match[2].toUpperCase()} ${match[1]}`;
}

/** The student's attempt worth showing: a pass, then a plan, then a fail. */
export function attemptForCourse(code: string, attempts: readonly Attempt[]) {
  const mine = attempts.filter(
    (attempt) => attempt.courseCode === code && attempt.status !== "withdrawn",
  );
  return (
    mine.find((attempt) => attempt.status === "completed") ??
    mine.find(
      (attempt) =>
        attempt.status === "planned" || attempt.status === "enrolled",
    ) ??
    mine.find((attempt) => attempt.status === "failed")
  );
}

/**
 * Where a course stands in the student's plan, in place of the add button:
 * when it is planned, or the result it earned. A failed course can be
 * planned again.
 */
export function CoursePlanStatus({
  attempt,
  onAddToPlan,
}: {
  attempt: Attempt | undefined;
  onAddToPlan?: () => void;
}) {
  const add = (
    <Button
      className="w-full shrink-0 sm:w-auto"
      disabled={!onAddToPlan}
      onClick={onAddToPlan}
      type="button"
    >
      <Plus size={16} aria-hidden="true" />
      {attempt?.status === "failed" ? "Plan again" : "Add to plan"}
    </Button>
  );
  if (!attempt) return add;

  const result = attempt.mark ?? attempt.resultCode;
  const [Icon, tone, label] =
    attempt.status === "completed"
      ? [
          CheckCircle2,
          "text-emerald-700 dark:text-emerald-300",
          `Completed${result !== undefined ? ` · ${result}` : ""}`,
        ]
      : attempt.status === "failed"
        ? [
            XCircle,
            "text-rose-700 dark:text-rose-300",
            `Failed${result !== undefined ? ` · ${result}` : ""}`,
          ]
        : [
            CalendarCheck,
            "text-primary",
            `${attempt.status === "enrolled" ? "Enrolled" : "Planned"} · ${periodLabel(attempt.termId)}`,
          ];
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <p
        className={`flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium ${tone}`}
      >
        <Icon size={15} aria-hidden="true" />
        {label}
      </p>
      {attempt.status === "failed" ? (
        add
      ) : (
        <Button asChild variant="outline">
          <Link href="/plan">Open planner</Link>
        </Button>
      )}
    </div>
  );
}
