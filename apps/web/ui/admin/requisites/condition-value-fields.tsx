"use client";
import { Input } from "@coursemap/ui/primitives/input";
import { OptionPicker } from "@/ui/common/option-picker";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { type ReviewedConditionNode } from "@/lib/coursemap/requisite-conditions";
import {
  COURSE_LEVELS,
  CourseCodesInput,
  type OpenBind,
  UnitsInput,
  inlineControl,
} from "@/ui/admin/requisites/condition-inputs";
import {
  SearchPicker,
  searchCourses,
  searchProgrammes,
} from "@/ui/admin/requisites/condition-search-picker";

export function InlineValueFields({
  bindOpen,
  condition,
  onChange,
  stacked,
}: {
  bindOpen: (key: string) => OpenBind;
  condition: ReviewedConditionNode;
  onChange: (next: ReviewedConditionNode) => void;
  stacked: boolean;
}) {
  const fieldId = useId();

  if (condition.kind === "course" || condition.kind === "incompatible") {
    return (
      <SearchPicker
        className={cn(
          inlineControl,
          stacked ? "min-w-[8rem]" : "w-52 min-w-52",
        )}
        empty="No courses match."
        label="Course"
        onSearch={searchCourses}
        onSelect={(code, title) =>
          onChange({ ...condition, courseCode: code, courseTitle: title })
        }
        value={condition.courseCode ?? ""}
        valueTitle={condition.courseTitle}
        {...bindOpen("course")}
      />
    );
  }

  if (condition.kind === "structure") {
    return (
      <SearchPicker
        className={cn(
          inlineControl,
          stacked ? "min-w-[8rem]" : "w-52 min-w-52",
        )}
        empty="No programmes match."
        label="Programme"
        onSearch={searchProgrammes}
        onSelect={(code, title) =>
          onChange({
            ...condition,
            structureCode: code,
            structureName: title,
          })
        }
        value={condition.structureCode ?? condition.freeText ?? ""}
        valueTitle={condition.structureName}
        {...bindOpen("programme")}
      />
    );
  }

  if (condition.kind === "units_total") {
    return <UnitsInput condition={condition} onChange={onChange} />;
  }

  if (condition.kind === "subject_units") {
    return (
      <>
        <UnitsInput condition={condition} onChange={onChange} />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          in
        </span>
        <Input
          aria-label="Subject code"
          className={cn(inlineControl, "w-28 min-w-28")}
          id={`${fieldId}-subject`}
          maxLength={4}
          onChange={(event) =>
            onChange({
              ...condition,
              subjectCode: event.target.value.toUpperCase() || null,
            })
          }
          placeholder="COMP"
          value={condition.subjectCode ?? ""}
        />
      </>
    );
  }

  if (condition.kind === "level_units") {
    const level = condition.level ?? 0;
    const levels = COURSE_LEVELS.includes(level)
      ? COURSE_LEVELS
      : [...COURSE_LEVELS, level].filter(Boolean).sort((a, b) => a - b);
    return (
      <>
        <UnitsInput condition={condition} onChange={onChange} />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          at
        </span>
        <OptionPicker
          value={"coursemap:" + String(level)}
          onValueChange={(nextValue) => {
            const option = levels
              .map((option) => ({
                value: option,
                label: `${option} level`,
              }))
              .find(
                (option) => "coursemap:" + String(option.value) === nextValue,
              );
            if (option)
              ((next) => onChange({ ...condition, level: next }))(option.value);
          }}
          {...bindOpen("level")}
          className={cn(inlineControl, "min-w-[8rem]")}
          aria-label={"Course level"}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder={"Level"}
          items={levels
            .map((option) => ({
              value: option,
              label: `${option} level`,
            }))
            .map((option) => ({
              value: "coursemap:" + String(option.value),
              label: option.label,
            }))}
        />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          in
        </span>
        <Input
          aria-label="Discipline, optional"
          className={cn(
            inlineControl,
            "w-40 min-w-40 max-md:w-full max-md:min-w-0",
          )}
          maxLength={4}
          onChange={(event) =>
            onChange({
              ...condition,
              subjectCode: event.target.value.toUpperCase() || null,
            })
          }
          placeholder="optional subject"
          value={condition.subjectCode ?? ""}
        />
      </>
    );
  }

  if (condition.kind === "course_set_units") {
    return (
      <>
        <UnitsInput condition={condition} onChange={onChange} />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          from
        </span>
        <CourseCodesInput condition={condition} onChange={onChange} />
      </>
    );
  }

  if (condition.kind === "year_standing") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Input
          aria-label="Minimum year standing"
          className={cn(inlineControl, "w-20 min-w-20")}
          max={10}
          min={1}
          onChange={(event) =>
            onChange({
              ...condition,
              minimumYear:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="2"
          step="1"
          type="number"
          value={condition.minimumYear ?? ""}
        />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          year
        </span>
      </span>
    );
  }

  if (condition.kind === "gpa") {
    return (
      <Input
        aria-label="Minimum grade average"
        className={cn(inlineControl, "w-24 min-w-24")}
        max={7}
        min={0}
        onChange={(event) =>
          onChange({ ...condition, gpa: Number(event.target.value) })
        }
        placeholder="5.0"
        step="0.25"
        type="number"
        value={condition.gpa ?? ""}
      />
    );
  }

  if (condition.kind === "wam") {
    return (
      <Input
        aria-label="Minimum WAM"
        className={cn(inlineControl, "w-24 min-w-24")}
        max={100}
        min={0}
        onChange={(event) =>
          onChange({
            ...condition,
            wam: event.target.value === "" ? null : Number(event.target.value),
          })
        }
        placeholder="65"
        step="0.5"
        type="number"
        value={condition.wam ?? ""}
      />
    );
  }

  if (condition.kind === "other" && stacked) {
    return (
      <Textarea
        aria-label="Wording"
        className="min-h-20 w-full min-w-0 resize-y border-transparent bg-transparent py-2 shadow-none"
        onChange={(event) =>
          onChange({ ...condition, freeText: event.target.value })
        }
        placeholder="Describe the condition"
        value={condition.freeText ?? ""}
      />
    );
  }

  return (
    <Input
      aria-label={
        condition.kind === "permission" ? "Who must approve" : "Wording"
      }
      className={cn(
        inlineControl,
        "min-w-[14rem] max-md:w-full max-md:min-w-0",
      )}
      onChange={(event) =>
        onChange({ ...condition, freeText: event.target.value })
      }
      placeholder={
        condition.kind === "permission"
          ? "Course convener"
          : "Describe the condition"
      }
      value={condition.freeText ?? ""}
    />
  );
}

/**
 * Three dropdowns on one row: what it is, how it matches, and the value.
 */
