"use client";
import { OptionPicker } from "@/ui/common/option-picker";
import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  applyCourseMatch,
  CONDITION_FAMILY_KINDS,
  CONDITION_KIND_LABELS,
  conditionFamily,
  courseMatch,
  type ReviewedConditionKind,
  type ReviewedConditionNode,
} from "@/lib/coursemap/requisite-conditions";
import {
  COURSE_MATCH_OPTIONS,
  CourseMarkInput,
  type OpenBind,
  inlineControl,
  middleOptions,
  stackedMatchControl,
  stackedValueCell,
} from "@/ui/admin/requisites/condition-inputs";
import { InlineValueFields } from "@/ui/admin/requisites/condition-value-fields";

export const KIND_OPTIONS = CONDITION_FAMILY_KINDS.map((kind) => ({
  value: kind,
  label:
    {
      course: "Course",
      structure: "Programme",
      units_total: "Total units",
      subject_units: "Subject units",
      level_units: "Level units",
      course_set_units: "Courses worth units",
      year_standing: "Year standing",
      gpa: "Grade average",
      wam: "WAM",
      permission: "Permission",
      other: "Other wording",
    }[kind] ?? CONDITION_KIND_LABELS[kind],
}));
const stackedFamilyControl =
  "!h-10 min-h-10 w-full min-w-0 !rounded-none !border-transparent bg-transparent px-3 text-[13px] font-medium text-foreground/80 shadow-none max-md:!h-11 max-md:min-h-11";
/**
 * Three dropdowns on one row: what it is, how it matches, and the value.
 */
export function ConditionInlineEditor({
  className,
  condition,
  layout = "inline",
  onChange,
  onKindChange,
  singleLine = false,
}: {
  className?: string;
  condition: ReviewedConditionNode;
  layout?: "inline" | "stacked";
  onChange: (next: ReviewedConditionNode) => void;
  onKindChange: (kind: ReviewedConditionKind) => void;
  singleLine?: boolean;
}) {
  const family = conditionFamily(condition.kind);
  const middle = middleOptions(family);
  const [openField, setOpenField] = useState<string | null>(null);

  function bindOpen(key: string): OpenBind {
    return {
      open: openField === key,
      onOpenChange: (next) => setOpenField(next ? key : null),
    };
  }

  const familyControl = (
    <OptionPicker
      value={"coursemap:" + String(family)}
      onValueChange={(nextValue) => {
        const option = KIND_OPTIONS.find(
          (option) => "coursemap:" + String(option.value) === nextValue,
        );
        if (option) onKindChange(option.value);
      }}
      {...bindOpen("family")}
      className={cn(
        inlineControl,
        layout === "stacked" && stackedFamilyControl,
      )}
      aria-label={"Condition type"}
      onPointerDown={(event) => event.stopPropagation()}
      placeholder={"Select..."}
      items={KIND_OPTIONS.map((option) => ({
        value: "coursemap:" + String(option.value),
        label: option.label,
      }))}
    />
  );
  const matchControl =
    family === "course" ? (
      <OptionPicker
        value={"coursemap:" + String(courseMatch(condition))}
        onValueChange={(nextValue) => {
          const option = COURSE_MATCH_OPTIONS.find(
            (option) => "coursemap:" + String(option.value) === nextValue,
          );
          if (option)
            ((next) => onChange(applyCourseMatch(condition, next)))(
              option.value,
            );
        }}
        {...bindOpen("match")}
        className={cn(
          inlineControl,
          layout === "stacked" && stackedMatchControl,
        )}
        aria-label={"Course requirement"}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder={"Select..."}
        items={COURSE_MATCH_OPTIONS.map((option) => ({
          value: "coursemap:" + String(option.value),
          label: option.label,
        }))}
      />
    ) : (
      <span
        aria-label={`Requirement: ${middle[0]?.label ?? "At least"}`}
        className={cn(
          "inline-flex h-9 min-h-9 min-w-[7.5rem] items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground",
          layout === "stacked" &&
            "h-10 min-h-10 w-full min-w-0 !rounded-none px-2.5 max-md:h-11 max-md:min-h-11",
        )}
      >
        {middle[0]?.label ?? "At least"}
      </span>
    );
  const values = (
    <InlineValueFields
      bindOpen={bindOpen}
      condition={condition}
      onChange={onChange}
      stacked={layout === "stacked"}
    />
  );
  const hasMark = condition.kind === "course" && condition.mark != null;
  const markControl = hasMark ? (
    <CourseMarkInput condition={condition} onChange={onChange} />
  ) : null;

  if (layout === "stacked") {
    return (
      <span
        className={cn(
          "grid w-full min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs",
          className,
        )}
      >
        <span className="flex min-w-0 items-center border-b border-border">
          {familyControl}
        </span>
        {family === "course" ? (
          <span
            className={cn(
              "grid min-w-0",
              markControl
                ? "md:grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,0.7fr)_5rem]"
                : "md:grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,0.7fr)]",
            )}
          >
            <span
              className={cn(
                stackedValueCell,
                "border-b border-border md:border-r md:border-b-0",
              )}
              data-slot="condition-value"
            >
              {values}
            </span>
            <span
              className={cn(
                "flex min-w-0 items-center",
                markControl &&
                  "border-b border-border md:border-r md:border-b-0",
              )}
            >
              {matchControl}
            </span>
            {markControl ? (
              <span className={stackedValueCell}>{markControl}</span>
            ) : null}
          </span>
        ) : family === "structure" ? (
          <span className="grid min-w-0 md:grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,0.7fr)]">
            <span
              className={cn(
                stackedValueCell,
                "border-b border-border md:border-r md:border-b-0",
              )}
              data-slot="condition-value"
            >
              {values}
            </span>
            <span className="flex min-w-0 items-center">{matchControl}</span>
          </span>
        ) : (
          <span className="grid min-w-0 md:grid-cols-[minmax(8rem,0.65fr)_minmax(10rem,1.35fr)]">
            <span className="flex min-w-0 items-center border-b border-border md:border-r md:border-b-0">
              {matchControl}
            </span>
            <span className={stackedValueCell} data-slot="condition-value">
              {values}
            </span>
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1",
        singleLine ? "flex-nowrap" : "flex-wrap",
        className,
      )}
    >
      {familyControl}
      {family === "course" || family === "structure" ? (
        <>
          {values}
          {matchControl}
          {markControl}
        </>
      ) : (
        <>
          {matchControl}
          {values}
        </>
      )}
    </span>
  );
}
