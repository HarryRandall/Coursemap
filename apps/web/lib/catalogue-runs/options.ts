import { isBulkImportKind } from "./kinds.ts";

export function parseCourseRunOptions(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Import options are required.");
  const data = value as Record<string, unknown>;
  const year = data.year;
  const kind = data.kind ?? "course";
  if (!isBulkImportKind(kind))
    throw new TypeError("Choose courses, majors, minors or specialisations.");
  const limit = data.limit ?? 100;
  const budgetUsd = data.budgetUsd ?? 0.5;
  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2030
  )
    throw new TypeError("Choose a catalogue year between 2020 and 2030.");
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 2_147_483_647
  )
    throw new TypeError("Choose a positive number of records.");
  if (
    typeof budgetUsd !== "number" ||
    !Number.isFinite(budgetUsd) ||
    budgetUsd < 0.01 ||
    budgetUsd > 10
  )
    throw new TypeError("Set a spending limit between US$0.01 and US$10.");
  return {
    year,
    kind,
    limit,
    budgetUsd,
    publishVerified: data.publishVerified === true,
  };
}
