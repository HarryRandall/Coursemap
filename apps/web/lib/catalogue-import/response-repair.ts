export type StructuredResponseRepair = "extra_requirement_closing_brace" | null;

/** Recovers one observed structure-only syntax error without changing the paid response. */
export function repairStructuredResponse(
  content: string,
  schemaName: string,
): { parsed: unknown; repair: Exclude<StructuredResponseRepair, null> } | null {
  if (schemaName !== "academic_structure_extraction") return null;
  const extraBrace = '}]}},"unmodelledText":';
  if (content.split(extraBrace).length !== 2) return null;
  try {
    const corrected = content.replace(extraBrace, '}]},"unmodelledText":');
    const parsed = JSON.parse(corrected) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("requirements" in parsed) ||
      typeof parsed.requirements !== "object" ||
      parsed.requirements === null ||
      !("unmodelledText" in parsed.requirements) ||
      !Array.isArray(parsed.requirements.unmodelledText)
    )
      return null;
    return { parsed, repair: "extra_requirement_closing_brace" };
  } catch {
    return null;
  }
}
