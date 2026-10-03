import type {
  AcademicStructureRequirementCondition,
  AcademicStructureRequirements,
  AcademicStructureRequirementRule,
} from "./contract.ts";

/** Accept only complete, flat allocations. Unknown wording invalidates the whole parse. */
export function parsePlainStructureRequirements(
  text: string | null,
  totalUnits: number | null,
): AcademicStructureRequirements | null {
  if (!text || !totalUnits) return null;
  const lines = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines.shift() ?? "";
  const direct = first.match(
    /^This (?:major|minor|specialisation) requires the completion of (\d+) units from the following courses:$/iu,
  );
  if (direct)
    lines.unshift(
      `${direct[1]} units from completion of courses from the following list:`,
    );
  const root =
    direct ??
    first.match(
      /^This (?:major|minor|specialisation) requires the completion of (\d+) units,? (?:which must include|of which):$/iu,
    );
  if (!root || Number(root[1]) !== totalUnits) return null;
  const children: AcademicStructureRequirementRule[] = [];
  const seen = new Set<string>();
  let allocated = 0;
  while (lines.length) {
    const heading = lines.shift()!;
    const allocation = heading.match(
      /^(\d+) units (?:from|must come from) (?:the )?completion of (?:the following compulsory courses?|courses from the following list):$/iu,
    );
    if (!allocation) return null;
    const units = Number(allocation[1]);
    const codes: string[] = [];
    const source = [heading];
    while (lines.length && !/^\d+ units /iu.test(lines[0]!)) {
      const row = lines.shift()!;
      // A second code, alternatives or provisos in a row need interpretation.
      const match = row.match(/^([A-Z]{4}\d{4}[A-Z]?)\s+(?:-\s*)?\S.+$/u);
      if (
        !match ||
        (row.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu)?.length ?? 0) !== 1 ||
        /\b(?:or|except|excluding|permission|only|must)\b/iu.test(
          row.replace(/^\S+\s+/u, ""),
        )
      )
        return null;
      if (seen.has(match[1]!)) return null;
      seen.add(match[1]!);
      codes.push(match[1]!);
      source.push(row);
    }
    if (!codes.length || units <= 0) return null;
    const condition: AcademicStructureRequirementCondition = {
      type: "condition",
      key: `allocation-${children.length + 1}`,
      conditionKind: "course_list",
      minimumUnits: units,
      maximumUnits: units,
      minimumCourses: /compulsory/iu.test(heading) ? codes.length : null,
      courseCodes: codes,
      structureKind: null,
      structureCodes: [],
      subjectCode: null,
      minimumLevel: null,
      maximumLevel: null,
      tag: null,
      freeText: null,
      scope: "part",
      includesAnyCourse: false,
      sourceText: source.join("\n\n"),
      sourceLocator: "Requirements",
    };
    children.push(condition);
    allocated += units;
  }
  if (!children.length || allocated !== totalUnits) return null;
  return {
    sourceText: text,
    sourceLocator: "Requirements",
    unmodelledText: [],
    rule: {
      type: "group",
      key: "structure",
      operator: "all_of",
      minimumCount: null,
      scope: "part",
      title: null,
      sourceText: text,
      sourceLocator: "Requirements",
      children,
    },
  };
}
