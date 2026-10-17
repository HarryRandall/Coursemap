import type {
  CatalogueContent,
  CatalogueContentFlag,
  RequirementRuleKind,
  RequirementWrite,
} from "../catalogue/content.ts";
import { contentHashForCatalogueContent } from "./version-content.ts";

export const REQUISITE_FALLBACK_CODE = "REQUISITE_FALLBACK";
export const REQUISITE_FALLBACK_MESSAGE =
  "Published with ANU's wording as a note; review the requisite rule.";

type Condition = RequirementWrite["conditions"][number];
type Group = RequirementWrite["groups"][number];

// Rules that hold eligibility; incompatibilities and assumed knowledge are
// never rewritten.
const ELIGIBILITY_RULES: readonly RequirementRuleKind[] = [
  "prerequisite",
  "corequisite",
];

/** Whether a flag is about the course's requisites rather than another field. */
export function isRequisiteFlag(flag: CatalogueContentFlag) {
  const path = flag.fieldPath ?? "";
  return path === "requisites" || path.startsWith("requisites.");
}

/**
 * A flag saying the modelled rule itself may be wrong, not merely incomplete:
 * an AND/OR grouping it guessed, or a value the page does not print. Such a
 * rule could turn away students ANU accepts, so the fallback keeps it soft.
 */
function doubtsModelledRule(flag: CatalogueContentFlag) {
  return (
    flag.fieldPath === "requisites.prerequisiteRule" &&
    (flag.code === "AMBIGUOUS" || flag.code === "EVIDENCE_MISSING")
  );
}

/** Wording the importer stored because it could not model it. */
function isLeftoverCondition(condition: Condition) {
  return (
    ELIGIBILITY_RULES.includes(condition.ruleKey) &&
    condition.kind === "other" &&
    condition.hardness === "hard" &&
    /:condition:(?:raw|unmodelled\.\d+)$/u.test(condition.key)
  );
}

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function comparable(text: string) {
  return text.replace(/\s+/gu, " ").trim().toLowerCase();
}

/** Wording without list markers or trailing separators, for comparison. */
function bareWording(text: string) {
  return comparable(text)
    .replace(/^[-*•]\s*/u, "")
    .replace(/[\s,;]+$/u, "");
}

/**
 * Whether the clause is already shown: it sits inside wording the answer
 * shows, or nothing meaningful is left once that wording is removed.
 */
function coveredBy(clause: string, shown: string[]) {
  const bare = bareWording(clause);
  if (bare.length >= 12 && shown.some((text) => text.includes(bare)))
    return true;
  let rest = clause;
  for (const text of shown) rest = rest.split(text).join(" ");
  return (rest.match(/[a-z0-9]{3,}/gu) ?? []).length <= 2;
}

export type RequisiteFallbackResult =
  | {
      content: CatalogueContent;
      /** The clauses now shown as "Check with ANU" notes. */
      notes: string[];
      /** Requisite errors lowered to warnings. */
      downgraded: number;
      /** Whether the modelled rule was kept as soft. */
      softened: boolean;
    }
  | { refused: string };

/**
 * Publishes what a course's agent answer could model, with ANU's leftover
 * wording beside it. Only for untouched local agent drafts whose every error
 * is about requisites: the modelled rule is kept, each leftover clause
 * (unmodelled text, a clause withheld for unscoped AND/OR, and eligibility
 * sentences the rule does not represent) becomes a "Check with ANU" note that
 * never blocks, and each requisite error becomes a warning for later review.
 * Returns new content with a recomputed hash; the input is not changed.
 */
export function requisiteFallbackContent(
  input: CatalogueContent,
): RequisiteFallbackResult {
  if (input.kind !== "course")
    return { refused: "Only course requisites have a fallback." };
  const errors = input.flags.filter((flag) => flag.severity === "error");
  if (!errors.length) return { refused: "The draft has no errors." };
  const other = errors.find((flag) => !isRequisiteFlag(flag));
  if (other)
    return {
      refused: `The draft has an error outside its requisites: ${other.message}`,
    };

  const content = structuredClone(input);
  const requirements = content.requirements;
  const notes: string[] = [];
  // A clause already shown, alone or inside a longer note such as the whole
  // unmodelled wording, is not shown twice.
  const seen: string[] = [];
  // Wording the answer already shows, possibly split across several notes
  // or rules, such as one required note per bullet of a joined sentence.
  const modelled = requirements.conditions
    .filter((condition) => !isLeftoverCondition(condition))
    .flatMap((condition) => [condition.sourceText, condition.freeText])
    .filter((text): text is string => Boolean(text?.trim()))
    .map((text) => bareWording(text))
    .filter((text) => text.length >= 12);
  const remember = (text: string) => {
    const key = comparable(text);
    if (seen.some((shown) => shown.includes(key))) return false;
    if (coveredBy(key, modelled)) return false;
    seen.push(key);
    return true;
  };

  // Leftovers already stored as hard wording become notes in place, so the
  // modelled parts of the rule keep their positions. Further paragraphs of
  // the same leftover follow at the end of its group, one note each.
  const conditions: Condition[] = [];
  const split: Condition[] = [];
  for (const condition of requirements.conditions) {
    if (!isLeftoverCondition(condition)) {
      conditions.push(condition);
      continue;
    }
    const parts = paragraphs(
      condition.freeText ?? condition.sourceText ?? "",
    ).filter(remember);
    parts.forEach((text, index) => {
      notes.push(text);
      const note: Condition = {
        ...condition,
        key: index === 0 ? condition.key : `${condition.key}.${index}`,
        freeText: text,
        sourceText: text,
        hardness: "advisory",
        noteKind: "check_with_anu",
      };
      (index === 0 ? conditions : split).push(note);
    });
  }
  requirements.conditions = conditions;
  for (const note of split) {
    note.position = nextPosition(requirements, note.groupKey);
    requirements.conditions.push(note);
  }

  const softened = errors.some(doubtsModelledRule);
  if (softened)
    for (const condition of requirements.conditions)
      if (ELIGIBILITY_RULES.includes(condition.ruleKey))
        condition.hardness = "advisory";

  // Clauses only a flag knows: eligibility sentences the rule does not
  // represent, kept as the flag's excerpt. A requisite error with no clause
  // of its own (a guessed grouping, an omitted GPA) shows the whole ANU
  // wording instead, so nothing the rule may have missed is hidden.
  const extra: string[] = [];
  let needsWholeText = false;
  for (const flag of errors) {
    if (flag.sourceExcerpt?.trim())
      extra.push(...paragraphs(flag.sourceExcerpt));
    else if (
      !/could not model this requirement|guessed rule was withheld/u.test(
        flag.message,
      )
    )
      needsWholeText = true;
  }
  const prerequisite = requirements.rules.find(
    (rule) => rule.key === "prerequisite",
  );
  if (needsWholeText && prerequisite?.sourceText)
    extra.push(...paragraphs(prerequisite.sourceText));
  const added = extra.filter(remember);
  if (added.length) {
    const rootKey = ensureNoteGroup(requirements, added.join("\n\n"));
    for (const text of added) {
      notes.push(text);
      requirements.conditions.push(
        fallbackNote(rootKey, nextPosition(requirements, rootKey), text),
      );
    }
  }

  let downgraded = 0;
  content.flags = content.flags.map((flag) => {
    if (flag.severity !== "error") return flag;
    downgraded += 1;
    return {
      ...flag,
      severity: "warning",
      code: REQUISITE_FALLBACK_CODE,
      message: `${REQUISITE_FALLBACK_MESSAGE} ${flag.message}`,
    };
  });
  content.contentHash = contentHashForCatalogueContent(content);
  return { content, notes, downgraded, softened };
}

function fallbackNote(
  groupKey: string,
  position: number,
  text: string,
): Condition {
  return {
    key: `prerequisite:condition:fallback.${position}`,
    ruleKey: "prerequisite",
    groupKey,
    position,
    kind: "other",
    itemCode: null,
    itemKind: null,
    structureKind: null,
    requirementMode: null,
    minimumMark: null,
    minimumUnits: null,
    maximumUnits: null,
    minimumCount: null,
    subjectCode: null,
    minimumLevel: null,
    maximumLevel: null,
    minimumYear: null,
    minimumGpa: null,
    minimumWam: null,
    tag: null,
    freeText: text,
    hardness: "advisory",
    sourceText: text,
    sourceLocator: null,
    reviewState: "automatic",
    confidence: 0,
    noteKind: "check_with_anu",
  };
}

/**
 * The prerequisite group notes are added to, which must require all of its
 * children: a note beside a choice would become one more alternative. A rule
 * whose root is a choice gains a new all-of root above it, and a course with
 * no prerequisite rule gains one.
 */
function ensureNoteGroup(requirements: RequirementWrite, sourceText: string) {
  const root = requirements.groups.find(
    (group) => group.ruleKey === "prerequisite" && group.parentKey === null,
  );
  if (root?.operator === "all_of") return root.key;
  if (!requirements.rules.some((rule) => rule.key === "prerequisite")) {
    requirements.rules.unshift({
      key: "prerequisite",
      hardness: "hard",
      sourceText,
      sourceLocator: null,
      reviewState: "automatic",
      confidence: 0,
      position: 0,
    });
  }
  const key = "prerequisite:group:fallback";
  const group: Group = {
    key,
    ruleKey: "prerequisite",
    parentKey: null,
    label: null,
    description: null,
    operator: "all_of",
    minimumCount: null,
    minimumUnits: null,
    maximumUnits: null,
    sourceText: null,
    sourceLocator: null,
    position: 0,
  };
  if (!root) {
    requirements.groups.unshift(group);
    return key;
  }
  // The new root goes immediately before the old one, which readback orders
  // the same way, so the stored version hashes as this content does.
  root.parentKey = key;
  root.position = 0;
  requirements.groups.splice(requirements.groups.indexOf(root), 0, group);
  return key;
}

/** The place after every condition and group already in a group. */
function nextPosition(requirements: RequirementWrite, groupKey: string) {
  return (
    Math.max(
      -1,
      ...requirements.conditions
        .filter((condition) => condition.groupKey === groupKey)
        .map((condition) => condition.position),
      ...requirements.groups
        .filter((group) => group.parentKey === groupKey)
        .map((group) => group.position),
    ) + 1
  );
}
