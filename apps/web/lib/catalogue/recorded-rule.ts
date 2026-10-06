import { z } from "zod";

import { ENROLMENT_MODES } from "../academic/enrolment-mode.ts";
import {
  CATALOGUE_KINDS,
  validateCatalogueContent,
  type CatalogueContent,
  type RequirementRuleKind,
} from "./content.ts";

const text = z.string().nullable();
const amount = z.number().nonnegative().nullable();
const count = z.number().int().nonnegative().nullable();
const position = z.number().int().nonnegative();
const key = z.string().trim().min(1);
const ruleKey = z.enum([
  "prerequisite",
  "corequisite",
  "incompatibility",
  "permission",
  "assumed_knowledge",
  "structure",
]);
const groupSchema = z
  .object({
    key,
    ruleKey,
    parentKey: key.nullable(),
    label: text,
    description: text,
    operator: z.enum(["all_of", "any_of", "at_least"]),
    minimumCount: count,
    minimumUnits: amount,
    maximumUnits: amount,
    scope: z.literal("degree").optional(),
    sourceText: text,
    sourceLocator: text,
    position,
  })
  .strict();
const conditionSchema = z
  .object({
    key,
    ruleKey,
    groupKey: key,
    position,
    kind: z.enum([
      "course",
      "incompatible",
      "incompatible_concurrent",
      "structure",
      "structure_set",
      "course_set_units",
      "consecutive_semester_pair",
      "units_total",
      "subject_units",
      "subject_courses",
      "level_units",
      "tagged_units",
      "elective_units",
      "year_standing",
      "commencement_year",
      "enrolment_mode",
      "college_enrolment",
      "gpa",
      "wam",
      "permission",
      "other",
    ]),
    itemCode: text,
    itemKind: z.enum(CATALOGUE_KINDS).nullable(),
    structureKind: z
      .enum(["programme", "major", "minor", "specialisation"])
      .nullable(),
    requirementMode: z
      .enum(["completed", "completed_or_concurrent"])
      .nullable(),
    minimumMark: z.number().min(0).max(100).nullable(),
    minimumUnits: amount,
    maximumUnits: amount,
    minimumCount: count,
    subjectCode: text,
    minimumLevel: count,
    maximumLevel: count,
    minimumYear: count,
    enrolmentMode: z.enum(ENROLMENT_MODES).nullable().optional(),
    matchesEnrolmentMode: z.boolean().nullable().optional(),
    minimumCommencementYear: count.optional(),
    maximumCommencementYear: count.optional(),
    minimumGpa: z.number().min(0).max(7).nullable(),
    minimumWam: z.number().min(0).max(100).nullable(),
    tag: text,
    freeText: text,
    hardness: z.enum(["hard", "advisory"]),
    sourceText: text,
    sourceLocator: text,
    reviewState: z.enum(["automatic", "verified", "review"]),
    confidence: z.number().min(0).max(1),
    scope: z.literal("degree").optional(),
    includesAnyCourse: z.literal(true).optional(),
  })
  .strict();
const recordedRuleSchema = z
  .object({
    references: z
      .array(
        z
          .object({
            ruleKey,
            code: key,
            sourceText: z.string(),
            confidence: z.number().min(0).max(1),
            reviewState: z.enum(["automatic", "verified", "review"]),
          })
          .strict(),
      )
      .optional(),
    groups: z.array(groupSchema).min(1),
    conditions: z.array(conditionSchema),
    options: z.array(
      z
        .object({
          conditionKey: key,
          position,
          kind: z.enum(CATALOGUE_KINDS),
          code: key,
          title: text,
          sourceText: text,
        })
        .strict(),
    ),
  })
  .strict();

export function recordedRuleContent(
  content: CatalogueContent,
  selected: RequirementRuleKind,
) {
  const conditions = content.requirements.conditions.filter(
    (row) => row.ruleKey === selected,
  );
  const conditionKeys = new Set(conditions.map((row) => row.key));
  return {
    references: content.requirements.references.filter(
      (row) => row.ruleKey === selected,
    ),
    groups: content.requirements.groups.filter(
      (row) => row.ruleKey === selected,
    ),
    conditions,
    options: content.requirements.options.filter((row) =>
      conditionKeys.has(row.conditionKey),
    ),
  };
}

/** Applies only this rule's rows to the latest content; never a captured record. */
export function catalogueContentWithRecordedRule(
  content: CatalogueContent,
  selected: RequirementRuleKind,
  submitted: unknown,
  expectedRule: string,
): CatalogueContent {
  if (JSON.stringify(recordedRuleContent(content, selected)) !== expectedRule)
    throw new TypeError(
      "This rule changed while you were editing. Reset the recorded rule before applying corrections.",
    );
  const result = recordedRuleSchema.safeParse(submitted);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new TypeError(
      `The recorded rule is invalid at ${issue.path.join(".") || "the root"}: ${issue.message}.`,
    );
  }
  const next = result.data;
  if (
    ![...next.groups, ...next.conditions, ...(next.references ?? [])].every(
      (row) => row.ruleKey === selected,
    )
  )
    throw new TypeError("The correction must contain only the selected rule.");
  const others = recordedRuleContent(content, selected);
  const oldConditions = new Set(others.conditions.map((row) => row.key));
  const otherGroupKeys = new Set(
    content.requirements.groups
      .filter((row) => row.ruleKey !== selected)
      .map((row) => row.key),
  );
  const otherConditionKeys = new Set(
    content.requirements.conditions
      .filter((row) => row.ruleKey !== selected)
      .map((row) => row.key),
  );
  const groupKeys = new Set(next.groups.map((row) => row.key));
  const conditionKeys = new Set(next.conditions.map((row) => row.key));
  if (
    groupKeys.size !== next.groups.length ||
    conditionKeys.size !== next.conditions.length ||
    next.groups.some((row) => otherGroupKeys.has(row.key)) ||
    next.conditions.some((row) => otherConditionKeys.has(row.key))
  )
    throw new TypeError(
      "The correction contains duplicate keys or keys belonging to another rule.",
    );
  if (next.groups.filter((row) => row.parentKey === null).length !== 1)
    throw new TypeError("The correction must contain exactly one root group.");
  if (!content.requirements.rules.some((rule) => rule.key === selected))
    throw new TypeError("The selected rule is no longer recorded.");
  for (const group of next.groups) {
    const children =
      next.groups.filter((row) => row.parentKey === group.key).length +
      next.conditions.filter((row) => row.groupKey === group.key).length;
    if (
      group.operator === "at_least" &&
      (group.minimumCount === null ||
        group.minimumCount < 1 ||
        group.minimumCount > children)
    )
      throw new TypeError(
        "An at-least group needs a positive count within its number of children.",
      );
    if (group.operator !== "at_least" && group.minimumCount !== null)
      throw new TypeError("Only at-least groups may specify a minimum count.");
    const visited = new Set<string>([group.key]);
    let parent = group.parentKey;
    while (parent !== null) {
      if (!groupKeys.has(parent) || visited.has(parent))
        throw new TypeError(
          "The correction contains a missing parent group or a cycle.",
        );
      visited.add(parent);
      parent = next.groups.find((row) => row.key === parent)!.parentKey;
    }
  }
  if (
    next.conditions.some((row) => !groupKeys.has(row.groupKey)) ||
    next.options.some((row) => !conditionKeys.has(row.conditionKey))
  )
    throw new TypeError(
      "Every condition and option must belong to the selected rule's groups and conditions.",
    );
  const optionPositions = new Set(
    next.options.map((row) => `${row.conditionKey}:${row.position}`),
  );
  if (optionPositions.size !== next.options.length)
    throw new TypeError(
      "Options for the same condition must have distinct positions.",
    );
  for (const row of [...next.groups, ...next.conditions]) {
    if (
      row.minimumUnits !== null &&
      row.maximumUnits !== null &&
      row.minimumUnits > row.maximumUnits
    )
      throw new TypeError("A minimum unit value cannot exceed its maximum.");
  }
  return validateCatalogueContent({
    ...content,
    requirements: {
      ...content.requirements,
      references:
        next.references === undefined ||
        JSON.stringify(next.references) === JSON.stringify(others.references)
          ? content.requirements.references
          : [
              ...content.requirements.references.filter(
                (row) => row.ruleKey !== selected,
              ),
              ...next.references,
            ],
      groups: [
        ...content.requirements.groups.filter(
          (row) => row.ruleKey !== selected,
        ),
        ...next.groups,
      ],
      conditions: [
        ...content.requirements.conditions.filter(
          (row) => row.ruleKey !== selected,
        ),
        ...next.conditions,
      ],
      options: [
        ...content.requirements.options.filter(
          (row) => !oldConditions.has(row.conditionKey),
        ),
        ...next.options,
      ],
    },
  });
}
