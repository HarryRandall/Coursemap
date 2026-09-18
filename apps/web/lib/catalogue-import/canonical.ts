import { createHash } from "node:crypto";

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function canonicalise(value: unknown, ancestors: Set<object>): CanonicalJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain a non-finite number");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new TypeError(
      `Canonical JSON cannot contain a value of type ${typeof value}`,
    );
  }

  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON cannot contain a circular reference");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalise(item, ancestors));
    }

    const record = value as Record<string, unknown>;
    const output: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item === undefined) {
        throw new TypeError(
          `Canonical JSON cannot contain undefined at property ${key}`,
        );
      }
      output[key] = canonicalise(item, ancestors);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Serialises JSON with recursively sorted object keys. Array order is retained
 * because positions in outcomes, assessments, fees and offerings are semantic.
 */
export function stableStringify(value: unknown) {
  return JSON.stringify(canonicalise(value, new Set()));
}

export function stableFingerprint(value: unknown) {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

/** Hashes source artefacts byte-for-byte. Do not normalise source HTML first. */
export function textFingerprint(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
