"use client";
import { Input } from "@coursemap/ui/primitives/input";
import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  type ConditionFamilyKind,
  type CourseMatch,
  type ReviewedConditionNode,
} from "@/lib/coursemap/requisite-conditions";

export const inlineControl =
  "!h-9 min-h-9 w-auto min-w-[7.5rem] rounded-md px-2.5 text-xs font-medium text-foreground/80 shadow-none";

export const stackedMatchControl =
  "!h-10 min-h-10 w-full min-w-0 !rounded-none !border-transparent bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none max-md:!h-11 max-md:min-h-11";
export const stackedValueCell =
  "flex min-h-10 min-w-0 flex-wrap items-center gap-1 px-2 py-1 text-xs text-muted-foreground max-md:min-h-11 [&_[data-slot=input]]:!h-8 [&_[data-slot=input]]:max-w-full [&_[data-slot=input]]:!border-transparent [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:text-xs [&_[data-slot=input]]:font-medium [&_[data-slot=input]]:text-foreground/80 [&_[data-slot=input]]:shadow-none [&_[data-slot=search-picker-trigger]]:!h-8 [&_[data-slot=search-picker-trigger]]:max-w-full [&_[data-slot=search-picker-trigger]]:!border-transparent [&_[data-slot=search-picker-trigger]]:bg-transparent [&_[data-slot=search-picker-trigger]]:text-xs [&_[data-slot=search-picker-trigger]]:text-foreground/80 [&_[data-slot=search-picker-trigger]]:shadow-none max-md:[&_[data-slot=search-picker-trigger]]:!h-10 max-md:[&_[data-slot=search-picker-trigger]]:!w-full max-md:[&_[data-slot=search-picker-trigger]]:!min-w-0 [&_[data-slot=option-picker-trigger]]:!h-8 [&_[data-slot=option-picker-trigger]]:max-w-full [&_[data-slot=option-picker-trigger]]:!border-transparent [&_[data-slot=option-picker-trigger]]:bg-transparent [&_[data-slot=option-picker-trigger]]:text-xs [&_[data-slot=option-picker-trigger]]:font-medium [&_[data-slot=option-picker-trigger]]:text-foreground/80 [&_[data-slot=option-picker-trigger]]:shadow-none [&_[data-slot=textarea]]:!border-transparent [&_[data-slot=textarea]]:bg-transparent [&_[data-slot=textarea]]:text-xs [&_[data-slot=textarea]]:text-foreground/80 [&_[data-slot=textarea]]:shadow-none";
export const COURSE_MATCH_OPTIONS: Array<{
  value: CourseMatch;
  label: string;
}> = [
  { value: "completed", label: "Must be completed" },
  { value: "concurrent", label: "Completed or concurrent" },
  { value: "not_completed", label: "Must not be completed" },
  { value: "mark", label: "Mark of at least" },
];

/** ANU codes the year of a course in its level, from 1000 up to 9000. */
export /** ANU codes the year of a course in its level, from 1000 up to 9000. */
const COURSE_LEVELS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000];
export function middleOptions(family: ConditionFamilyKind) {
  if (family === "course") return COURSE_MATCH_OPTIONS;
  if (family === "structure") {
    return [{ value: "enrolled", label: "Enrolment required" }];
  }
  if (family === "permission") {
    return [{ value: "required", label: "Required from" }];
  }
  if (family === "other") {
    return [{ value: "custom", label: "Described as" }];
  }
  return [{ value: "at_least", label: "At least" }];
}
export function UnitsInput({
  condition,
  onChange,
}: {
  condition: ReviewedConditionNode;
  onChange: (next: ReviewedConditionNode) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        aria-label="Units completed"
        className={cn(inlineControl, "w-[4.5rem] min-w-[4.5rem]")}
        min={0.5}
        onChange={(event) =>
          onChange({
            ...condition,
            units:
              event.target.value === "" ? null : Number(event.target.value),
          })
        }
        placeholder="6"
        step="0.5"
        type="number"
        value={condition.units ?? ""}
      />
      <span
        data-slot="condition-grammar"
        className="text-xs text-muted-foreground"
      >
        units
      </span>
    </span>
  );
}
export function CourseCodesInput({
  condition,
  onChange,
}: {
  condition: ReviewedConditionNode;
  onChange: (next: ReviewedConditionNode) => void;
}) {
  const [value, setValue] = useState(() =>
    (condition.courseCodes ?? []).join(", "),
  );
  return (
    <Input
      aria-label="Course codes"
      className={cn(
        inlineControl,
        "w-64 min-w-64 max-md:w-full max-md:min-w-0",
      )}
      onChange={(event) => {
        const next = event.target.value.toUpperCase();
        setValue(next);
        onChange({
          ...condition,
          courseCodes: next.split(/[\s,;]+/u).filter(Boolean),
        });
      }}
      placeholder="COMP1100, COMP1110"
      value={value}
    />
  );
}
export function CourseMarkInput({
  condition,
  onChange,
}: {
  condition: ReviewedConditionNode;
  onChange: (next: ReviewedConditionNode) => void;
}) {
  if (condition.kind !== "course" || condition.mark == null) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        aria-label="Minimum mark"
        className={cn(inlineControl, "w-16 min-w-16")}
        max={100}
        min={0}
        onChange={(event) =>
          onChange({
            ...condition,
            mark: event.target.value === "" ? 0 : Number(event.target.value),
          })
        }
        step="1"
        type="number"
        value={condition.mark}
      />
      <span
        data-slot="condition-grammar"
        className="text-xs text-muted-foreground"
      >
        %
      </span>
    </span>
  );
}
export type OpenBind = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
