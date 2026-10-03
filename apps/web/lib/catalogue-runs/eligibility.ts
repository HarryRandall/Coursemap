import type { CatalogueContent } from "../catalogue/content.ts";
import { classifyFirstRead } from "../catalogue/first-read.ts";

/** Publication requires a complete verified candidate, never a partial copy. */
export function verifiedCoursePublication(
  content: CatalogueContent,
): CatalogueContent | null {
  if (content.kind !== "course" || content.flags.length) return null;
  const verified = new Set(
    content.evidence
      .filter(
        (item) =>
          item.method === "deterministic" &&
          item.confidence === 1 &&
          item.sourceExcerpt,
      )
      .map((item) => item.fieldPath),
  );
  if (
    ![
      "title",
      "unitValue",
      "academicCareer",
      "description",
      "offerings",
      "requisites",
    ].every((key) => verified.has(key))
  )
    return null;
  for (const [field, values] of [
    ["fees", content.course.fees],
    ["learningOutcomes", content.course.learningOutcomes],
    ["assessmentItems", content.course.assessmentItems],
  ] as const) {
    if (values.length && !verified.has(field)) return null;
  }
  if (classifyFirstRead(content).some((item) => item.band !== "accepted"))
    return null;
  return content;
}

export function sourceFirstPublicationEligible(content: CatalogueContent) {
  return verifiedCataloguePublication(content) !== null;
}

/** Structures need independent coverage of the whole source and its completion tree. */
export function verifiedCataloguePublication(
  content: CatalogueContent,
): CatalogueContent | null {
  if (content.kind === "course") return verifiedCoursePublication(content);
  if (content.kind === "programme" || content.flags.length) return null;
  const verified = new Set(
    content.evidence
      .filter(
        (item) =>
          item.method === "deterministic" &&
          item.confidence === 1 &&
          item.sourceExcerpt,
      )
      .map((item) => item.fieldPath),
  );
  if (
    !["title", "totalUnits", "requirements", "sourceCoverage"].every((key) =>
      verified.has(key),
    )
  )
    return null;
  if (
    !content.structure.details.units ||
    !content.requirements.rules.length ||
    !content.requirements.conditions.length
  )
    return null;
  if (
    content.requirements.conditions.some(
      (condition) =>
        condition.kind === "other" || condition.reviewState === "review",
    )
  )
    return null;
  if (classifyFirstRead(content).some((item) => item.band !== "accepted"))
    return null;
  return content;
}
