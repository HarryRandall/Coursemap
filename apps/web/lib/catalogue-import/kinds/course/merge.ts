import {
  type CourseExtraction,
  type CourseExtractionReviewItem,
  type CourseExtractionValidationIssue,
  validateCourseExtraction,
} from "./contract.ts";
import { stableStringify } from "../../canonical.ts";

export type CourseEvidenceIssue = {
  evidenceIndex: number;
  fieldKey: string;
  message: string;
};

export type CourseExtractionConflict = {
  fieldKey: string;
  deterministicValue: unknown;
  modelValue: unknown;
};

export type CourseExtractionMergeResult = {
  extraction: CourseExtraction;
  conflicts: CourseExtractionConflict[];
  evidenceIssues: CourseEvidenceIssue[];
  modelValidationIssues: CourseExtractionValidationIssue[];
  modelAcceptedFields: string[];
  modelRejectedFields: string[];
};

function normaliseEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-AU");
}

/**
 * Model evidence must quote text that is actually present in the selected-year
 * model input. A CSS-like locator alone is not evidence.
 */
export function checkCourseExtractionEvidence(
  extraction: CourseExtraction,
  modelInput: string,
) {
  const source = normaliseEvidenceText(modelInput);
  const issues: CourseEvidenceIssue[] = [];
  const matchedFieldKeys: string[] = [];
  extraction.evidence.forEach((evidence, evidenceIndex) => {
    const excerpt = normaliseEvidenceText(evidence.evidenceExcerpt);
    const claimedValue = pathValue(extraction, evidence.fieldKey);
    const simpleClaim =
      typeof claimedValue === "string" || typeof claimedValue === "number"
        ? normaliseEvidenceText(String(claimedValue))
        : null;
    if (evidence.method !== "model") {
      issues.push({
        evidenceIndex,
        fieldKey: evidence.fieldKey,
        message: "Model evidence must identify its method as model.",
      });
    } else if (excerpt.length < 3) {
      issues.push({
        evidenceIndex,
        fieldKey: evidence.fieldKey,
        message: "The evidence excerpt is too short to verify.",
      });
    } else if (!source.includes(excerpt)) {
      issues.push({
        evidenceIndex,
        fieldKey: evidence.fieldKey,
        message:
          "The evidence excerpt does not occur in the selected-year model input.",
      });
    } else if (simpleClaim && !excerpt.includes(simpleClaim)) {
      issues.push({
        evidenceIndex,
        fieldKey: evidence.fieldKey,
        message:
          "The evidence excerpt does not support the claimed scalar value.",
      });
    } else if (!matchedFieldKeys.includes(evidence.fieldKey)) {
      matchedFieldKeys.push(evidence.fieldKey);
    }
  });
  return { issues, matchedFieldKeys };
}

function pathValue(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function assignPath(value: unknown, path: string, nextValue: unknown) {
  const keys = path.split(".");
  let current = value as Record<string, unknown>;
  keys.slice(0, -1).forEach((key) => {
    current = current[key] as Record<string, unknown>;
  });
  current[keys.at(-1)!] = structuredClone(nextValue);
}

function hasUsefulValue(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    const kind = (value as Record<string, unknown>).kind;
    return kind !== "unknown";
  }
  if (value === "unknown") return false;
  return true;
}

const UNORDERED_FIELDS = new Set([
  "attributes",
  "areasOfInterest",
  "fees",
  "relatedCourses",
  "requisites.incompatibilityCourseCodes",
  "requisites.softIncompatibilityCourseCodes",
]);

/** Evidence locators and excerpts describe provenance, not a different value.
 * Only set-like collections ignore ordering. Outcome and assessment positions
 * remain significant because assessment links refer to those positions.
 */
function comparisonValue(value: unknown, unordered: boolean): unknown {
  if (Array.isArray(value)) {
    const values = value.map((item) => comparisonValue(item, unordered));
    return unordered
      ? values.sort((left, right) =>
          stableStringify(left).localeCompare(stableStringify(right)),
        )
      : values;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            key !== "sourceText" &&
            key !== "sourceLocator" &&
            !(unordered && key === "position"),
        )
        .map(([key, item]) => [
          key,
          comparisonValue(
            item,
            unordered || key === "learningOutcomePositions",
          ),
        ]),
    );
  }
  return value;
}

function valuesEqual(fieldKey: string, left: unknown, right: unknown) {
  const unordered = UNORDERED_FIELDS.has(fieldKey);
  return (
    stableStringify(comparisonValue(left, unordered)) ===
    stableStringify(comparisonValue(right, unordered))
  );
}

const MERGE_FIELDS = [
  "title",
  "unitValue",
  "eftsl",
  "subjectName",
  "school",
  "college",
  "academicCareer",
  "convenerText",
  "deliverySummary",
  "introduction",
  "description",
  "workloadText",
  "workloadHours",
  "inherentRequirements",
  "prescribedTexts",
  "offeringStatus",
  "sourceUpdatedAt",
  "areasOfInterest",
  "fees",
  "learningOutcomes",
  "assessmentItems",
  "offerings",
  "requisites.prerequisiteText",
  "requisites.corequisiteText",
  "requisites.incompatibilityText",
  "requisites.prerequisiteRule",
  "requisites.corequisiteRule",
  "requisites.incompatibilityCourseCodes",
  "requisites.softIncompatibilityCourseCodes",
  "requisites.unmodelledText",
  "relatedCourses",
  "attributes",
] as const;

function mergeReviewItems(
  base: CourseExtractionReviewItem[],
  additions: CourseExtractionReviewItem[],
) {
  const output = [...base];
  for (const item of additions) {
    if (
      !output.some(
        (existing) =>
          existing.fieldKey === item.fieldKey &&
          existing.kind === item.kind &&
          existing.message === item.message,
      )
    ) {
      output.push(item);
    }
  }
  return output;
}

/**
 * Deterministic extraction owns identity and every source-obvious value. The
 * model may fill a genuinely empty field only when its evidence excerpt can be
 * found in the selected-year input. A disagreement never overwrites the
 * deterministic value; it becomes an explicit review conflict.
 */
export function mergeCourseExtractions({
  deterministic,
  model,
  modelInput,
}: {
  deterministic: CourseExtraction;
  model: unknown;
  modelInput: string;
}): CourseExtractionMergeResult {
  const deterministicValidation = validateCourseExtraction(deterministic, {
    expectedCode: deterministic.code,
    expectedYear: deterministic.year,
    evidenceMethod: "deterministic",
  });
  if (!deterministicValidation.success) {
    throw new TypeError(
      `The deterministic extraction is invalid: ${deterministicValidation.issues.map(({ path, message }) => `${path} ${message}`).join("; ")}`,
    );
  }

  const output = structuredClone(deterministicValidation.data);
  const modelValidation = validateCourseExtraction(model, {
    expectedCode: deterministic.code,
    expectedYear: deterministic.year,
    evidenceMethod: "model",
  });
  if (!modelValidation.success) {
    output.reviewItems = mergeReviewItems(output.reviewItems, [
      {
        fieldKey: "modelExtraction",
        kind: "invalid",
        severity: "error",
        message:
          "The model response failed the strict course extraction contract.",
      },
    ]);
    return {
      extraction: output,
      conflicts: [],
      evidenceIssues: [],
      modelValidationIssues: modelValidation.issues,
      modelAcceptedFields: [],
      modelRejectedFields: [],
    };
  }

  const evidenceCheck = checkCourseExtractionEvidence(
    modelValidation.data,
    modelInput,
  );
  const matchedEvidence = new Set(evidenceCheck.matchedFieldKeys);
  const conflicts: CourseExtractionConflict[] = [];
  const modelAcceptedFields: string[] = [];
  const modelRejectedFields: string[] = [];
  const reviewItems: CourseExtractionReviewItem[] = [...output.reviewItems];

  for (const fieldKey of MERGE_FIELDS) {
    const deterministicValue = pathValue(
      deterministicValidation.data,
      fieldKey,
    );
    const modelValue = pathValue(modelValidation.data, fieldKey);
    if (
      !hasUsefulValue(modelValue) ||
      valuesEqual(fieldKey, deterministicValue, modelValue)
    )
      continue;

    if (hasUsefulValue(deterministicValue)) {
      conflicts.push({ fieldKey, deterministicValue, modelValue });
      reviewItems.push({
        fieldKey,
        kind: "conflict",
        severity: "warning",
        message: `The model disagreed with deterministic extraction for ${fieldKey}; the deterministic value was retained.`,
      });
      modelRejectedFields.push(fieldKey);
      continue;
    }

    if (!matchedEvidence.has(fieldKey)) {
      reviewItems.push({
        fieldKey,
        kind: "evidence_missing",
        severity: "warning",
        message: `The model supplied ${fieldKey} without a matching excerpt from the selected-year source.`,
      });
      modelRejectedFields.push(fieldKey);
      continue;
    }

    assignPath(output, fieldKey, modelValue);
    modelAcceptedFields.push(fieldKey);
  }

  const acceptedEvidence = modelValidation.data.evidence.filter(
    ({ fieldKey }) => modelAcceptedFields.includes(fieldKey),
  );
  output.evidence = [...output.evidence, ...acceptedEvidence];
  output.reviewItems = mergeReviewItems(
    mergeReviewItems(reviewItems, modelValidation.data.reviewItems),
    evidenceCheck.issues.map(({ fieldKey, message }) => ({
      fieldKey,
      kind: "evidence_missing" as const,
      severity: "warning" as const,
      message,
    })),
  );
  const confidences = output.evidence.map(({ confidence }) => confidence);
  output.overallConfidence =
    confidences.length > 0
      ? Math.min(...confidences)
      : output.overallConfidence;

  const finalValidation = validateCourseExtraction(output, {
    expectedCode: deterministic.code,
    expectedYear: deterministic.year,
  });
  if (!finalValidation.success) {
    throw new TypeError(
      `The merged extraction is invalid: ${finalValidation.issues.map(({ path, message }) => `${path} ${message}`).join("; ")}`,
    );
  }
  return {
    extraction: finalValidation.data,
    conflicts,
    evidenceIssues: evidenceCheck.issues,
    modelValidationIssues: [],
    modelAcceptedFields,
    modelRejectedFields: [...new Set(modelRejectedFields)],
  };
}
