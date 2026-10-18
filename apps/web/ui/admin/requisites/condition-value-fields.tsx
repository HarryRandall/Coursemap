"use client";
import {
  ENROLMENT_MODES,
  enrolmentModeLabel,
  validEnrolmentMode,
} from "@/lib/academic/enrolment-mode";
import {
  PROGRAMME_CAREERS,
  programmeCareerLabel,
  validProgrammeCareer,
} from "@/lib/academic/programme-career";
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

function listValues(text: string) {
  return text
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

/** The subjects or printed wording a grade average is limited to. */
function AverageScopeInputs({
  condition,
  onChange,
}: {
  condition: ReviewedConditionNode;
  onChange: (next: ReviewedConditionNode) => void;
}) {
  return (
    <>
      {/* Uncontrolled, so a separator typed between codes is not reformatted away. */}
      <Input
        aria-label="Average over subjects, separated by commas, blank for all"
        className={cn(inlineControl, "w-40 min-w-40")}
        defaultValue={(condition.subjectCodes ?? []).join(", ")}
        onChange={(event) => {
          const codes = listValues(event.target.value).map((code) =>
            code.toUpperCase(),
          );
          onChange({ ...condition, subjectCodes: codes.length ? codes : null });
        }}
        placeholder="All subjects"
      />
      <Input
        aria-label="Average scope as printed, when no codes are given"
        className={cn(inlineControl, "w-44 min-w-44")}
        onChange={(event) =>
          onChange({ ...condition, freeText: event.target.value || null })
        }
        placeholder="Printed scope, optional"
        value={condition.freeText ?? ""}
      />
    </>
  );
}

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

  if (
    condition.kind === "course" ||
    condition.kind === "incompatible" ||
    condition.kind === "incompatible_concurrent"
  ) {
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

  if (
    condition.kind === "subject_units" ||
    condition.kind === "subject_courses"
  ) {
    return (
      <>
        {condition.kind === "subject_courses" ? (
          <span className="inline-flex items-center gap-1.5">
            <Input
              aria-label="Course count"
              className={cn(inlineControl, "w-20 min-w-20")}
              min={1}
              max={32767}
              step="1"
              type="number"
              value={condition.courseCount ?? ""}
              onChange={(event) =>
                onChange({
                  ...condition,
                  courseCount:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
            <span className="text-xs text-muted-foreground">courses</span>
          </span>
        ) : (
          <UnitsInput condition={condition} onChange={onChange} />
        )}
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

  if (
    condition.kind === "course_count" ||
    condition.kind === "filtered_units"
  ) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {condition.kind === "course_count" ? (
          <span className="inline-flex items-center gap-1.5">
            <Input
              aria-label="Course count"
              className={cn(inlineControl, "w-20 min-w-20")}
              min={1}
              max={32767}
              step="1"
              type="number"
              value={condition.courseCount ?? ""}
              onChange={(event) =>
                onChange({
                  ...condition,
                  courseCount:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
            <span className="text-xs text-muted-foreground">courses</span>
          </span>
        ) : (
          <UnitsInput condition={condition} onChange={onChange} />
        )}
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          in
        </span>
        {/* Uncontrolled, so a separator typed between codes is not reformatted away. */}
        <Input
          aria-label="Subject codes, separated by commas"
          className={cn(inlineControl, "w-40 min-w-40")}
          defaultValue={(condition.subjectCodes ?? []).join(", ")}
          id={`${fieldId}-subjects`}
          onChange={(event) => {
            const codes = listValues(event.target.value).map((code) =>
              code.toUpperCase(),
            );
            onChange({
              ...condition,
              subjectCodes: codes.length ? codes : null,
            });
          }}
          placeholder="any subject"
        />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          at
        </span>
        <Input
          aria-label="Course levels, separated by commas"
          className={cn(inlineControl, "w-36 min-w-36")}
          defaultValue={(condition.courseLevels ?? []).join(", ")}
          id={`${fieldId}-levels`}
          onChange={(event) => {
            const levels = listValues(event.target.value).map(Number);
            onChange({
              ...condition,
              courseLevels: levels.length ? levels : null,
            });
          }}
          placeholder="any level"
        />
        <OptionPicker
          aria-label="Current enrolment"
          value={condition.courseRequirementMode ?? "completed"}
          items={[
            { value: "completed", label: "Completed" },
            {
              value: "completed_or_concurrent",
              label: "Completed or enrolled",
            },
          ]}
          onValueChange={(value) =>
            onChange({
              ...condition,
              courseRequirementMode:
                value === "completed_or_concurrent"
                  ? "completed_or_concurrent"
                  : "completed",
            })
          }
        />
      </span>
    );
  }

  if (condition.kind === "career") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <OptionPicker
          aria-label="Career match"
          value={
            condition.matchesCareer === null ||
            condition.matchesCareer === undefined
              ? ""
              : String(condition.matchesCareer)
          }
          items={[
            { value: "true", label: "Enrolled in" },
            { value: "false", label: "Not enrolled in" },
          ]}
          onValueChange={(value) =>
            onChange({ ...condition, matchesCareer: value === "true" })
          }
        />
        <OptionPicker
          aria-label="Academic career"
          value={condition.career ?? ""}
          items={PROGRAMME_CAREERS.map((value) => ({
            value,
            label: programmeCareerLabel(value),
          }))}
          onValueChange={(value) => {
            if (validProgrammeCareer(value))
              onChange({ ...condition, career: value });
          }}
        />
      </span>
    );
  }

  if (condition.kind === "enrolment_mode") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <OptionPicker
          aria-label="Enrolment mode"
          value={condition.enrolmentMode ?? ""}
          items={ENROLMENT_MODES.map((value) => ({
            value,
            label: enrolmentModeLabel(value),
          }))}
          onValueChange={(value) => {
            if (validEnrolmentMode(value))
              onChange({ ...condition, enrolmentMode: value });
          }}
        />
        <OptionPicker
          aria-label="Enrolment mode match"
          value={
            condition.matchesEnrolmentMode === null ||
            condition.matchesEnrolmentMode === undefined
              ? ""
              : String(condition.matchesEnrolmentMode)
          }
          items={[
            { value: "true", label: "Enrolled in" },
            { value: "false", label: "Not enrolled in" },
          ]}
          onValueChange={(value) =>
            onChange({ ...condition, matchesEnrolmentMode: value === "true" })
          }
        />
      </span>
    );
  }
  if (condition.kind === "commencement_year") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {(["minimumCommencementYear", "maximumCommencementYear"] as const).map(
          (key) => (
            <Input
              key={key}
              aria-label={
                key === "minimumCommencementYear"
                  ? "Earliest commencement year"
                  : "Latest commencement year"
              }
              className={cn(inlineControl, "w-24 min-w-24")}
              min={1900}
              max={9999}
              step={1}
              type="number"
              placeholder={
                key === "minimumCommencementYear" ? "Any start" : "Any end"
              }
              value={condition[key] ?? ""}
              onChange={(event) =>
                onChange({
                  ...condition,
                  [key]:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          ),
        )}
      </span>
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
      <span className="flex flex-wrap items-center gap-2">
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
        <Input
          aria-label="Most recent graded units, blank for whole career"
          className={cn(inlineControl, "w-32 min-w-32")}
          max={300}
          min={1}
          onChange={(event) =>
            onChange({
              ...condition,
              recentGradedUnits:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="Whole career"
          step={1}
          type="number"
          value={condition.recentGradedUnits ?? ""}
        />
        <AverageScopeInputs condition={condition} onChange={onChange} />
      </span>
    );
  }

  if (condition.kind === "wam") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Minimum WAM"
          className={cn(inlineControl, "w-24 min-w-24")}
          max={100}
          min={0}
          onChange={(event) =>
            onChange({
              ...condition,
              wam:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="65"
          step="0.5"
          type="number"
          value={condition.wam ?? ""}
        />
        <Input
          aria-label="Most recent graded units, blank for whole career"
          className={cn(inlineControl, "w-32 min-w-32")}
          max={300}
          min={1}
          onChange={(event) =>
            onChange({
              ...condition,
              recentGradedUnits:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="Whole career"
          step={1}
          type="number"
          value={condition.recentGradedUnits ?? ""}
        />
        <AverageScopeInputs condition={condition} onChange={onChange} />
      </span>
    );
  }

  if (condition.kind === "field_units") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <UnitsInput condition={condition} onChange={onChange} />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          in
        </span>
        <Input
          aria-label="Field as printed"
          className={cn(
            inlineControl,
            "min-w-[14rem] max-md:w-full max-md:min-w-0",
          )}
          onChange={(event) =>
            onChange({ ...condition, freeText: event.target.value })
          }
          placeholder="the relevant discipline"
          value={condition.freeText ?? ""}
        />
      </span>
    );
  }

  if (condition.kind === "subject_sequence") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          No completed
        </span>
        <Input
          aria-label="Subject code"
          className={cn(inlineControl, "w-28 min-w-28")}
          maxLength={4}
          onChange={(event) =>
            onChange({
              ...condition,
              subjectCode: event.target.value.toUpperCase() || null,
            })
          }
          placeholder="VIET"
          value={condition.subjectCode ?? ""}
        />
        <span
          data-slot="condition-grammar"
          className="text-xs text-muted-foreground"
        >
          course later than
        </span>
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
      </span>
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
        condition.kind === "permission"
          ? "Who must approve"
          : condition.kind === "college_enrolment"
            ? "Programme college"
            : "Wording"
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
          : condition.kind === "college_enrolment"
            ? "Full college name from the source"
            : "Describe the condition"
      }
      value={condition.freeText ?? ""}
    />
  );
}

/**
 * Three dropdowns on one row: what it is, how it matches, and the value.
 */
