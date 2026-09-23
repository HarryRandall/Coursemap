export type ModelExtractionIssue = { path: string; message: string };

export type ModelExtractionValidation<Extraction> =
  | { success: true; data: Extraction }
  | { success: false; issues: ModelExtractionIssue[] };

/** A part of the model response the contract refused, and why. */
export type DroppedModelValue = { fieldKey: string; messages: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Splits a validator path such as `$.fees[2].amount` or `$.fees.2.amount`
 * into the field and its next segment: an item index for an array, or a
 * property name for an object such as `requisites`.
 */
function issueTarget(path: string) {
  const segments = path
    .replace(/^\$\.?/, "")
    .split(/[.[\]]/)
    .filter(Boolean);
  const next = segments[1] ?? null;
  const index = next !== null && /^\d+$/.test(next) ? Number(next) : null;
  return {
    field: segments[0] ?? null,
    index,
    property: index === null ? next : null,
  };
}

/**
 * Keeps every part of a model response that satisfies the extraction
 * contract. A field the contract refuses returns to its empty value, and an
 * array loses only the items that fail, so one malformed fee does not cost
 * the requirement tree. `empty` is a complete, valid extraction for the
 * record; its `fixedKeys` (identity such as code and year) are never taken
 * from the model.
 */
export function salvageModelExtraction<
  Extraction extends Record<string, unknown>,
>({
  value,
  empty,
  fixedKeys,
  validate,
}: {
  value: unknown;
  empty: Extraction;
  fixedKeys: readonly string[];
  validate: (candidate: unknown) => ModelExtractionValidation<Extraction>;
}): { extraction: Extraction; dropped: DroppedModelValue[] } {
  const dropped = new Map<string, string[]>();
  const drop = (fieldKey: string, message: string) =>
    dropped.set(fieldKey, [...(dropped.get(fieldKey) ?? []), message]);
  const result = () => ({
    dropped: [...dropped].map(([fieldKey, messages]) => ({
      fieldKey,
      messages,
    })),
  });

  const candidate: Record<string, unknown> = structuredClone(empty);
  if (isRecord(value)) {
    for (const key of Object.keys(empty)) {
      if (!fixedKeys.includes(key) && key in value) {
        candidate[key] = structuredClone(value[key]);
      }
    }
  } else {
    drop("modelExtraction", "The model did not return a JSON object.");
  }

  // Every pass removes at least one refused value and a value is reset only
  // once, so the loop ends when the candidate is valid or nothing is left to
  // remove.
  const reset = new Set<string>();
  const resetTo = (
    target: Record<string, unknown>,
    key: string,
    emptyValue: unknown,
    fieldKey: string,
    message: string,
  ) => {
    drop(fieldKey, message);
    if (reset.has(fieldKey)) return false;
    reset.add(fieldKey);
    target[key] = structuredClone(emptyValue);
    return true;
  };
  for (;;) {
    const validation = validate(candidate);
    if (validation.success) {
      return { extraction: validation.data, ...result() };
    }
    const removals = new Map<string, Set<number>>();
    let changed = false;
    for (const issue of validation.issues) {
      const { field, index, property } = issueTarget(issue.path);
      if (!field || !(field in empty) || fixedKeys.includes(field)) continue;
      const message = `${issue.path} ${issue.message}`;
      const current = candidate[field];
      const emptyField = empty[field];
      if (index !== null && Array.isArray(current)) {
        removals.set(field, (removals.get(field) ?? new Set()).add(index));
        drop(`${field}[${index}]`, message);
      } else if (
        property !== null &&
        isRecord(current) &&
        isRecord(emptyField) &&
        property in emptyField &&
        !reset.has(`${field}.${property}`)
      ) {
        changed =
          resetTo(
            current,
            property,
            emptyField[property],
            `${field}.${property}`,
            message,
          ) || changed;
      } else {
        changed =
          resetTo(candidate, field, emptyField, field, message) || changed;
      }
    }
    for (const [field, indexes] of removals) {
      const items = candidate[field] as unknown[];
      candidate[field] = items.filter((_, index) => !indexes.has(index));
      changed = true;
    }
    if (!changed) break;
  }

  const fallback = validate(empty);
  if (!fallback.success) {
    throw new TypeError(
      `The empty extraction is invalid: ${fallback.issues
        .map(({ path, message }) => `${path} ${message}`)
        .join("; ")}`,
    );
  }
  drop("modelExtraction", "No part of the model response could be used.");
  return { extraction: fallback.data, ...result() };
}

/**
 * Every evidence item in a response comes from the model, whatever the model
 * wrote in its method field, so a slip there does not cost the evidence.
 */
export function withModelEvidenceMethod(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.evidence)) return value;
  return {
    ...value,
    evidence: value.evidence.map((item) =>
      isRecord(item) ? { ...item, method: "model" } : item,
    ),
  };
}

/**
 * Why a response cannot be trusted as complete, in words the review screen
 * can show. A response cut off at the output limit may still parse, but its
 * last fields are missing rather than absent from the page.
 */
export function modelResponseProblem({
  finishReason,
  responseError,
}: {
  finishReason: string | null;
  responseError: string | null;
}) {
  if (finishReason === "length") {
    return "The model reached its output limit before finishing, so fields at the end of the response may be missing. Sync again with a larger output allowance or another model.";
  }
  return responseError;
}
