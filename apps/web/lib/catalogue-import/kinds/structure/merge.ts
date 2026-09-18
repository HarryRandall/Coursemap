import {
  parseAcademicStructureExtraction,
  type AcademicStructureExtraction,
  type AcademicStructureRequirementRule,
} from "./contract.ts";

function normalisedSourceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\[(.*?)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sourceTokens(value: string) {
  return normalisedSourceText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function sourceSupportsStructuredText(source: string, candidate: string) {
  const normalisedCandidate = normalisedSourceText(candidate);
  if (!normalisedCandidate) return true;
  if (source.includes(normalisedCandidate)) return true;

  const sourceWords = sourceTokens(source);
  const candidateWords = sourceTokens(candidate);
  if (candidateWords.length === 0) return false;

  let sourceIndex = 0;
  return candidateWords.every((candidateWord) => {
    while (
      sourceIndex < sourceWords.length &&
      sourceWords[sourceIndex] !== candidateWord
    ) {
      sourceIndex += 1;
    }
    if (sourceIndex >= sourceWords.length) return false;
    sourceIndex += 1;
    return true;
  });
}

export function normaliseAcademicStructureModelExtraction(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value, normalisations: [] as string[] };
  }

  const normalised = structuredClone(value) as Record<string, unknown>;
  const normalisations: string[] = [];
  const requirements = normalised.requirements;
  if (
    typeof requirements !== "object" ||
    requirements === null ||
    Array.isArray(requirements)
  ) {
    return { value: normalised, normalisations };
  }

  const visitRule = (rule: unknown, path: string) => {
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
      return;
    }
    const record = rule as Record<string, unknown>;
    if (record.type === "group" && Array.isArray(record.children)) {
      record.children.forEach((child, index) =>
        visitRule(child, `${path}.children.${index}`),
      );
      return;
    }
    if (
      record.type === "condition" &&
      record.conditionKind === "level" &&
      typeof record.subjectCode === "string" &&
      record.subjectCode.trim() !== ""
    ) {
      record.conditionKind = "subject";
      normalisations.push(
        `${path}.conditionKind was changed from level to subject because the condition includes subjectCode.`,
      );
    }
    if (
      record.type === "condition" &&
      record.conditionKind !== "free_text" &&
      typeof record.freeText === "string"
    ) {
      record.freeText = null;
      normalisations.push(
        `${path}.freeText was cleared because sourceText already preserves the condition wording.`,
      );
    }
  };

  visitRule(
    (requirements as Record<string, unknown>).rule,
    "$.requirements.rule",
  );
  return { value: normalised, normalisations };
}

function requirementSourceTexts(
  rule: AcademicStructureRequirementRule | null,
): string[] {
  if (!rule) return [];
  return [
    rule.sourceText,
    ...(rule.type === "group"
      ? rule.children.flatMap((child) => requirementSourceTexts(child))
      : []),
  ];
}

export function academicStructureModelEvidenceIssues(
  extraction: AcademicStructureExtraction,
  modelInput: string,
) {
  const source = normalisedSourceText(modelInput);
  const structuredSourceTexts = [
    ...extraction.summaryFields.map(({ sourceText }) => sourceText),
    ...extraction.sections.map(({ sourceText }) => sourceText),
    ...extraction.learningOutcomes.map(({ sourceText }) => sourceText),
    ...extraction.fees.map(({ sourceText }) => sourceText),
    ...extraction.relationships.map(({ sourceText }) => sourceText),
    ...(extraction.requirements.sourceText
      ? [extraction.requirements.sourceText]
      : []),
    ...requirementSourceTexts(extraction.requirements.rule),
    ...extraction.requirements.unmodelledText,
  ];
  const evidenceExcerpts = extraction.evidence.map(
    ({ evidenceExcerpt }) => evidenceExcerpt,
  );
  return [
    ...new Set([
      ...structuredSourceTexts.flatMap((candidate) =>
        sourceSupportsStructuredText(source, candidate)
          ? []
          : [
              `Source wording was not supported by model input: ${candidate.slice(0, 160)}`,
            ],
      ),
      ...evidenceExcerpts.flatMap((candidate) => {
        const normalised = normalisedSourceText(candidate);
        return normalised && !source.includes(normalised)
          ? [
              `Source evidence was not found in model input: ${candidate.slice(0, 160)}`,
            ]
          : [];
      }),
    ]),
  ];
}

function relationshipKey(
  relationship: AcademicStructureExtraction["relationships"][number],
) {
  return [
    relationship.targetKind,
    relationship.targetCode,
    relationship.sourceLocator,
  ].join(":");
}

function mergeRelationships(
  deterministic: AcademicStructureExtraction["relationships"],
  model: AcademicStructureExtraction["relationships"],
) {
  const modelByKey = new Map(
    model.map((item) => [relationshipKey(item), item]),
  );
  const merged = deterministic.map(
    (item) => modelByKey.get(relationshipKey(item)) ?? item,
  );
  const present = new Set(merged.map(relationshipKey));
  merged.push(...model.filter((item) => !present.has(relationshipKey(item))));
  return merged.map((item, index) => ({ ...item, position: index + 1 }));
}

function mergeEvidence(
  deterministic: AcademicStructureExtraction["evidence"],
  model: AcademicStructureExtraction["evidence"],
) {
  const seen = new Set<string>();
  return [...deterministic, ...model].filter((item) => {
    const key = [
      item.fieldKey,
      item.sourceLocator,
      item.evidenceExcerpt,
      item.method,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeFees(
  deterministic: AcademicStructureExtraction["fees"],
  model: AcademicStructureExtraction["fees"],
) {
  const deterministicSources = new Set(
    deterministic.map(({ audience, sourceLocator }) =>
      JSON.stringify([audience, sourceLocator]),
    ),
  );
  return [
    ...deterministic,
    ...model.filter(
      ({ audience, sourceLocator }) =>
        !deterministicSources.has(JSON.stringify([audience, sourceLocator])),
    ),
  ].map((fee, index) => ({ ...fee, position: index + 1 }));
}

function ensureRequirementRootGroup(
  requirements: AcademicStructureExtraction["requirements"],
) {
  const rule = requirements.rule;
  if (!rule || rule.type === "group") return requirements;
  return {
    ...requirements,
    rule: {
      type: "group" as const,
      key:
        rule.key === "requirements:root"
          ? "requirements:root-group"
          : "requirements:root",
      operator: "all_of" as const,
      minimumCount: null,
      title: "Requirements",
      sourceText: requirements.sourceText ?? rule.sourceText,
      sourceLocator: requirements.sourceLocator ?? rule.sourceLocator,
      children: [rule],
    },
  };
}

export function mergeAcademicStructureExtractions({
  deterministic,
  model,
}: {
  deterministic: AcademicStructureExtraction;
  model: AcademicStructureExtraction;
}) {
  const modelHasRequirements = model.requirements.rule !== null;
  const deterministicReviewItems = deterministic.reviewItems.filter(
    (item) =>
      !(
        modelHasRequirements &&
        item.fieldKey === "requirements.rule" &&
        item.kind === "unsupported"
      ),
  );
  const reviewItems = [
    ...deterministicReviewItems,
    ...model.reviewItems,
  ].filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.fieldKey === item.fieldKey &&
          candidate.kind === item.kind &&
          candidate.message === item.message,
      ) === index,
  );
  const introduction = deterministic.introduction ?? model.introduction;
  const descriptionCandidate = deterministic.description ?? model.description;
  const description =
    introduction &&
    descriptionCandidate?.localeCompare(introduction, undefined, {
      sensitivity: "accent",
    }) === 0
      ? null
      : descriptionCandidate;
  const merged: AcademicStructureExtraction = {
    ...model,
    kind: deterministic.kind,
    code: deterministic.code,
    year: deterministic.year,
    title: deterministic.title,
    acronym: deterministic.acronym ?? model.acronym,
    shortName: deterministic.shortName ?? model.shortName,
    introduction,
    description,
    totalUnits: deterministic.totalUnits ?? model.totalUnits,
    durationYears: deterministic.durationYears ?? model.durationYears,
    academicCareer: deterministic.academicCareer ?? model.academicCareer,
    college: deterministic.college ?? model.college,
    deliveryMode: deterministic.deliveryMode ?? model.deliveryMode,
    selectionRank: deterministic.selectionRank ?? model.selectionRank,
    atar: deterministic.atar ?? model.atar,
    canCombine: deterministic.canCombine ?? model.canCombine,
    canCombineVertical:
      deterministic.canCombineVertical ?? model.canCombineVertical,
    studyAs: deterministic.studyAs ?? model.studyAs,
    contactText: deterministic.contactText ?? model.contactText,
    summaryFields: deterministic.summaryFields,
    sections: deterministic.sections,
    learningOutcomes: deterministic.learningOutcomes,
    fees: mergeFees(deterministic.fees, model.fees),
    relationships: mergeRelationships(
      deterministic.relationships,
      model.relationships,
    ),
    requirements: ensureRequirementRootGroup(
      modelHasRequirements ? model.requirements : deterministic.requirements,
    ),
    evidence: mergeEvidence(deterministic.evidence, model.evidence),
    reviewItems,
  };
  return parseAcademicStructureExtraction(merged, {
    expectedKind: deterministic.kind,
    expectedCode: deterministic.code,
    expectedYear: deterministic.year,
  });
}
