import type { CourseExtraction, CourseRule } from "./contract.ts";

type CourseRequisites = CourseExtraction["requisites"];

/** Wording ANU prints where a section has nothing to say. */
const PLACEHOLDER_PATTERN = /^(?:n\/?a|none|nil|not applicable)$/u;

// Shorter wording, such as a bare course code, is too generic to attribute to
// the assumed knowledge section on containment alone.
const MINIMUM_COMPARABLE_LENGTH = 12;

/** Lowercase words only, without Markdown links, list markers or punctuation. */
function comparableWords(text: string) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/^\s*(?:[-*+]|\(?[a-z0-9]{1,3}[.)])\s+/gimu, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Whether text says only that a section does not apply, such as "N/A". */
export function isPlaceholderText(text: string | null | undefined) {
  return PLACEHOLDER_PATTERN.test(
    (text ?? "")
      .trim()
      .replace(/[.\s]+$/u, "")
      .toLowerCase(),
  );
}

/** The wording a text-bearing node records, or null for a checked condition. */
function nodeWording(rule: CourseRule): string | null {
  switch (rule.op) {
    case "soft":
      return rule.sourceText ?? null;
    case "note":
    case "external_requirement":
    case "equivalent_course":
      return rule.sourceText;
    default:
      return null;
  }
}

function isTextOnly(rule: CourseRule) {
  return (
    rule.op === "note" ||
    rule.op === "external_requirement" ||
    rule.op === "equivalent_course"
  );
}

/**
 * Removes nodes the predicate matches. Only text-only conditions and soft
 * wrappers are candidates, so a checked hard condition survives unless a soft
 * wrapper the predicate matches encloses it. A one_of never loses a whole
 * alternative: an advisory alternative always passes, so dropping it would
 * make the remaining alternatives compulsory. Returns undefined when nothing
 * of the rule is left.
 */
function pruneRule(
  rule: CourseRule,
  isRemovable: (wording: string) => boolean,
): CourseRule | undefined {
  const wording = nodeWording(rule);
  if (
    (rule.op === "soft" || isTextOnly(rule)) &&
    wording !== null &&
    isRemovable(wording)
  )
    return undefined;
  if (rule.op === "soft") {
    const inner = pruneRule(rule.rule, isRemovable);
    if (!inner) return undefined;
    return inner === rule.rule ? rule : { ...rule, rule: inner };
  }
  if (rule.op !== "all_of" && rule.op !== "one_of") return rule;
  const children = rule.rules.map((child) => {
    const pruned = pruneRule(child, isRemovable);
    return rule.op === "one_of" ? (pruned ?? child) : pruned;
  });
  if (children.every((child, index) => child === rule.rules[index]))
    return rule;
  const kept = children.filter((child) => child !== undefined);
  if (kept.length === 0) return undefined;
  if (kept.length === 1) return kept[0];
  return { ...rule, rules: kept };
}

/** Every wording the rule still records, used to keep its source paragraphs. */
function ruleWordings(rule: CourseRule | null): string[] {
  if (!rule) return [];
  const own = nodeWording(rule);
  const children =
    rule.op === "all_of" || rule.op === "one_of"
      ? rule.rules.flatMap(ruleWordings)
      : rule.op === "soft"
        ? ruleWordings(rule.rule)
        : [];
  return own ? [own, ...children] : children;
}

/**
 * Drops paragraphs of a requisite's source wording that repeat assumed
 * knowledge, unless a condition still kept in the rule quotes them. The
 * source parser appends mandatory-sounding assumed knowledge sentences to the
 * requisite text for review; they belong to the assumed knowledge rule.
 * Returns null when every paragraph repeats assumed knowledge.
 */
function withoutAssumedKnowledgeParagraphs(
  text: string | null,
  isAssumedKnowledge: (wording: string) => boolean,
  rule: CourseRule | null,
) {
  if (!text) return text;
  const kept = ruleWordings(rule).map(comparableWords);
  const paragraphs = text.split(/\n\s*\n/u);
  const remaining = paragraphs.filter((paragraph) => {
    if (!isAssumedKnowledge(paragraph)) return true;
    const comparable = comparableWords(paragraph);
    return kept.some((wording) => wording && comparable.includes(wording));
  });
  if (remaining.length === paragraphs.length) return text;
  return remaining.length ? remaining.join("\n\n") : null;
}

/**
 * Assumed knowledge is always advisory and has its own rule. Model answers
 * built from requisite text that ended with the assumed knowledge paragraphs
 * repeat its sentences inside the prerequisite or corequisite rule as notes,
 * free text, soft conditions or even hard text conditions. This removes those
 * repeats, and placeholder wording such as "N/A", without touching checked
 * conditions. A rule left empty is dropped only when the rest of its source
 * wording is shown elsewhere; otherwise it keeps its original form, so the
 * remaining wording is never projected as one hard text condition.
 */
export function withoutAssumedKnowledgeRepeats(
  requisites: CourseRequisites,
): CourseRequisites {
  const assumedKnowledgeText = isPlaceholderText(
    requisites.assumedKnowledgeText,
  )
    ? null
    : (requisites.assumedKnowledgeText ?? null);
  const assumedKnowledge = comparableWords(assumedKnowledgeText ?? "");
  const isAssumedKnowledge = (wording: string) => {
    const comparable = comparableWords(wording);
    return (
      assumedKnowledge.length > 0 &&
      comparable.length >= MINIMUM_COMPARABLE_LENGTH &&
      assumedKnowledge.includes(comparable)
    );
  };
  const isRemovable = (wording: string) =>
    isPlaceholderText(wording) || isAssumedKnowledge(wording);
  // Whether other parts of the requisites already show all of the wording.
  const isCoveredBy = (text: string, covers: readonly (string | null)[]) => {
    let residue = ` ${comparableWords(text)} `;
    for (const cover of covers) {
      const comparable = comparableWords(cover ?? "");
      if (comparable) residue = residue.replaceAll(` ${comparable} `, " ");
    }
    return residue.trim() === "";
  };
  const unmodelledText = requisites.unmodelledText.filter(
    (wording) => !isRemovable(wording),
  );

  const cleanRequisite = (
    rule: CourseRule | null,
    text: string | null,
    extraText: readonly string[],
  ) => {
    const pruned = rule ? pruneRule(rule, isRemovable) : null;
    const nextRule = pruned ?? null;
    const remainingText = isPlaceholderText(text)
      ? null
      : withoutAssumedKnowledgeParagraphs(text, isAssumedKnowledge, nextRule);
    if (rule && !pruned) {
      // A rule made only of assumed knowledge often sits beside requisite
      // wording that the incompatibility rule or unmodelled text already
      // shows. Any other wording would become one hard text condition
      // without the rule, so the rule keeps its original form.
      if (
        remainingText &&
        !isCoveredBy(remainingText, [
          requisites.incompatibilityText,
          ...extraText,
        ])
      )
        return {
          rule,
          text: withoutAssumedKnowledgeParagraphs(
            text,
            isAssumedKnowledge,
            rule,
          ),
        };
      return { rule: null, text: null };
    }
    // Without a rule the remaining wording becomes a hard text condition, so
    // assumed knowledge paragraphs must not stay in it. A rule falls back to
    // its generated description only when it has no wording at all.
    if (!nextRule && !remainingText && extraText.length === 0)
      return { rule: null, text: null };
    return {
      rule: nextRule,
      text: nextRule ? (remainingText ?? text) : remainingText,
    };
  };
  const prerequisite = cleanRequisite(
    requisites.prerequisiteRule,
    requisites.prerequisiteText,
    unmodelledText,
  );
  const corequisite = cleanRequisite(
    requisites.corequisiteRule,
    requisites.corequisiteText,
    [],
  );

  return {
    ...requisites,
    assumedKnowledgeText,
    prerequisiteRule: prerequisite.rule,
    prerequisiteText: prerequisite.text,
    corequisiteRule: corequisite.rule,
    corequisiteText: corequisite.text,
    unmodelledText,
  };
}
