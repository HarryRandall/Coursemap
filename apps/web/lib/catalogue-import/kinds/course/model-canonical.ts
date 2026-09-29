import type { CourseExtractionReviewItem } from "./contract.ts";
import { type KnownProgramme, programmeCodeForName } from "./programmes.ts";

export type CourseModelCanonicalisationChange = {
  path: string;
  rule:
    | "human_date_to_iso"
    | "bare_class_summary_reference_to_null"
    | "programme_name_to_code";
  before: string;
  after: string | null;
};

export type CourseModelCanonicalisationResult = {
  value: unknown;
  changes: CourseModelCanonicalisationChange[];
};

const OFFERING_DATE_FIELDS = [
  "startsOn",
  "endsOn",
  "lastEnrolmentDate",
  "censusDate",
] as const;

const MONTHS = new Map<string, number>([
  ["Jan", 1],
  ["January", 1],
  ["Feb", 2],
  ["February", 2],
  ["Mar", 3],
  ["March", 3],
  ["Apr", 4],
  ["April", 4],
  ["May", 5],
  ["Jun", 6],
  ["June", 6],
  ["Jul", 7],
  ["July", 7],
  ["Aug", 8],
  ["August", 8],
  ["Sep", 9],
  ["September", 9],
  ["Oct", 10],
  ["October", 10],
  ["Nov", 11],
  ["November", 11],
  ["Dec", 12],
  ["December", 12],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isoDateFromHumanDate(value: unknown, expectedYear: number) {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{1,2}) (Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (\d{4})$/u.exec(
      value,
    );
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS.get(match[2]);
  const year = Number(match[3]);
  if (!month || year !== expectedYear) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Corrects bounded provider representation errors before strict runtime
 * validation. The raw OpenRouter response remains unchanged in its immutable
 * artefact, and unsupported values stay invalid instead of being coerced.
 */
export function canonicaliseCourseModelExtraction(
  value: unknown,
  {
    expectedCode,
    expectedYear,
    knownProgrammes = [],
  }: {
    expectedCode: string;
    expectedYear: number;
    knownProgrammes?: readonly KnownProgramme[];
  },
): CourseModelCanonicalisationResult {
  const canonical = structuredClone(value);
  const changes: CourseModelCanonicalisationChange[] = [];
  if (!isRecord(canonical)) {
    return { value: canonical, changes };
  }

  const resolveProgramme = (rule: unknown, path: string, depth = 0) => {
    if (!isRecord(rule) || depth > 16) return;
    if (rule.op === "enrolled_in" && typeof rule.programmeCode === "string") {
      const before = rule.programmeCode;
      const after = programmeCodeForName(before, knownProgrammes);
      if (after && after !== before) {
        rule.programmeCode = after;
        changes.push({
          path: `${path}.programmeCode`,
          rule: "programme_name_to_code",
          before,
          after,
        });
      }
    } else if (
      (rule.op === "all_of" || rule.op === "one_of") &&
      Array.isArray(rule.rules)
    ) {
      rule.rules.forEach((child, index) =>
        resolveProgramme(child, `${path}.rules[${index}]`, depth + 1),
      );
    }
  };
  if (isRecord(canonical.requisites)) {
    resolveProgramme(
      canonical.requisites.prerequisiteRule,
      "$.requisites.prerequisiteRule",
    );
    resolveProgramme(
      canonical.requisites.corequisiteRule,
      "$.requisites.corequisiteRule",
    );
  }

  if (!Array.isArray(canonical.offerings)) return { value: canonical, changes };

  canonical.offerings.forEach((candidate, index) => {
    if (!isRecord(candidate) || candidate.calendarYear !== expectedYear) return;

    for (const field of OFFERING_DATE_FIELDS) {
      const before = candidate[field];
      const after = isoDateFromHumanDate(before, expectedYear);
      if (typeof before !== "string" || after === null) continue;
      candidate[field] = after;
      changes.push({
        path: `$.offerings[${index}].${field}`,
        rule: "human_date_to_iso",
        before,
        after,
      });
    }

    if (candidate.classSummaryUrl === expectedCode.toUpperCase()) {
      const before = candidate.classSummaryUrl;
      candidate.classSummaryUrl = null;
      changes.push({
        path: `$.offerings[${index}].classSummaryUrl`,
        rule: "bare_class_summary_reference_to_null",
        before,
        after: null,
      });
    }
  });

  return { value: canonical, changes };
}

export function courseModelCanonicalisationReviewItem(
  changes: readonly CourseModelCanonicalisationChange[],
): CourseExtractionReviewItem | null {
  const formatting = changes.filter(
    (change) => change.rule !== "programme_name_to_code",
  );
  if (formatting.length === 0) return null;
  return {
    fieldKey: "modelExtraction",
    kind: "invalid",
    severity: "warning",
    message: `Coursemap normalised ${formatting.length} provider formatting ${formatting.length === 1 ? "value" : "values"} before strict validation. Inspect the validation report before accepting this draft.`,
  };
}
