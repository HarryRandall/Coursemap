import type {
  AcademicStructureRequirementCondition,
  AcademicStructureRequirementGroup,
  AcademicStructureRequirements,
} from "./contract.ts";

function subjectCondition(
  key: string,
  subject: string | null,
  codes: string[],
  minimumLevel: number | null,
  maximumLevel: number | null,
  maximumUnits: number,
  source: string,
): AcademicStructureRequirementCondition {
  return {
    type: "condition",
    key,
    conditionKind: subject ? "subject" : "course_list",
    minimumUnits: null,
    maximumUnits,
    minimumCourses: null,
    courseCodes: codes,
    subjectCode: subject,
    minimumLevel,
    maximumLevel,
    structureKind: null,
    structureCodes: [],
    tag: null,
    freeText: null,
    scope: "part",
    includesAnyCourse: false,
    sourceText: source,
    sourceLocator: "Requirements",
  };
}

function hasQualifier(text: string): boolean {
  return /\b(?:except|excluding|only|provided|subject to|permission|approval|prerequisite|equivalent|substitut|repeat|must|may|minimum|maximum)\b/iu.test(
    text,
  );
}

/** Bounded pools can mix several subjects without requiring units from each subject. */
export function parseSubjectStructureRequirements(
  text: string,
  totalUnits: number | null,
): AcademicStructureRequirements | null {
  if (!totalUnits) return null;
  const lines = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const root = lines
    .shift()
    ?.match(
      /^This (?:minor|major|specialisation) requires the completion of (\d+) units, which must (?:include|consist of):$/u,
    );
  if (!root || Number(root[1]) !== totalUnits) return null;
  const children: AcademicStructureRequirementGroup[] = [];
  let lowerTotal = 0;
  let upperTotal = 0;
  let hasSubjects = false;
  const seenSubjects: Array<{ subject: string; from: number; to: number }> = [];
  const seenCourses = new Set<string>();
  while (lines.length) {
    const heading = lines.shift()!;
    const allocation = heading.match(
      /^A (minimum|maximum) of (\d+) units from (?:the )?completion of (.+)$/u,
    );
    if (!allocation) return null;
    const amount = Number(allocation[2]);
    if (!amount || amount > totalUnits) return null;
    const minimum = allocation[1] === "minimum" ? amount : null;
    const maximum = allocation[1] === "maximum" ? amount : totalUnits;
    const wording = allocation[3]!;
    const key = `pool-${children.length + 1}`;
    const conditions: AcademicStructureRequirementCondition[] = [];
    const source = [heading];
    const addSubject = (
      subject: string,
      from: number,
      to: number,
      row: string,
    ) => {
      if (
        seenSubjects.some(
          (prior) =>
            prior.subject === subject && from <= prior.to && to >= prior.from,
        )
      )
        return false;
      seenSubjects.push({ subject, from, to });
      hasSubjects = true;
      conditions.push(
        subjectCondition(
          `${key}-${subject}`,
          subject,
          [],
          from,
          to,
          maximum,
          row,
        ),
      );
      return true;
    };
    if (wording === "courses from the following list:") {
      const codes: string[] = [];
      while (lines[0]?.match(/^[A-Z]{4}\d{4} /u)) {
        const row = lines.shift()!;
        const match = row.match(
          /^([A-Z]{4}\d{4}) [\p{L} ,:'’&-]+ \((\d+) units\)$/u,
        );
        if (
          !match ||
          hasQualifier(row) ||
          seenCourses.has(match[1]!) ||
          Number(match[2]) <= 0 ||
          Number(match[2]) > totalUnits
        )
          return null;
        seenCourses.add(match[1]!);
        codes.push(match[1]!);
        source.push(row);
      }
      if (!codes.length) return null;
      conditions.push(
        subjectCondition(
          `${key}-courses`,
          null,
          codes,
          null,
          null,
          maximum,
          source.join("\n\n"),
        ),
      );
    } else {
      const single = wording.match(
        /^(\d)000- level courses from the subject area ([A-Z]{4})- [\p{L} &-]+$/u,
      );
      const multiple = wording.match(
        /^(\d)000- and\/or (\d)000- level courses from the subject areas:$/u,
      );
      const mixed = wording.match(
        /^(\d)000- level courses which may come from:$/u,
      );
      if (single) {
        if (hasQualifier(wording)) return null;
        if (
          !addSubject(
            single[2]!,
            Number(single[1]) * 1000,
            Number(single[1]) * 1000 + 999,
            heading,
          )
        )
          return null;
      } else if (multiple || mixed) {
        const from = Number((multiple ?? mixed)![1]) * 1000;
        const to = Number(multiple?.[2] ?? mixed![1]) * 1000 + 999;
        if (to < from || (multiple && to - from !== 1999)) return null;
        if (mixed) {
          if (lines.shift() !== "The following subject areas:") return null;
          source.push("The following subject areas:");
        }
        while (lines[0]?.match(/^[A-Z]{4} /u)) {
          const row = lines.shift()!;
          const subject = row.match(/^([A-Z]{4}) (?:- )?[\p{L} &-]+$/u);
          if (
            !subject ||
            hasQualifier(row) ||
            !addSubject(subject[1]!, from, to, row)
          )
            return null;
          source.push(row);
        }
        if (!conditions.length) return null;
        if (mixed) {
          if (lines.shift() !== "The following course list:") return null;
          source.push("The following course list:");
          const codes: string[] = [];
          while (lines[0]?.match(/^[A-Z]{4}\d{4} /u)) {
            const row = lines.shift()!;
            const match = row.match(
              /^([A-Z]{4}\d{4}) - [\p{L} ,:'’&-]+ \((\d+) units\)$/u,
            );
            if (
              !match ||
              hasQualifier(row) ||
              Number(match[2]) <= 0 ||
              Number(match[2]) > totalUnits ||
              seenCourses.has(match[1]!) ||
              Number(match[1]![4]) * 1000 < from ||
              Number(match[1]![4]) * 1000 > to
            )
              return null;
            seenCourses.add(match[1]!);
            codes.push(match[1]!);
            source.push(row);
          }
          if (!codes.length) return null;
          conditions.push(
            subjectCondition(
              `${key}-courses`,
              null,
              codes,
              null,
              null,
              maximum,
              source.join("\n\n"),
            ),
          );
        }
      } else return null;
    }
    lowerTotal += minimum ?? 0;
    upperTotal += maximum;
    children.push({
      type: "group",
      key,
      operator: "all_of",
      minimumCount: null,
      minimumUnits: minimum,
      maximumUnits: maximum,
      scope: "part",
      title: null,
      sourceText: source.join("\n\n"),
      sourceLocator: "Requirements",
      children: conditions,
    });
  }
  // Overlapping pools need an allocation search, so keep them for review.
  if (
    [...seenCourses].some((code) =>
      seenSubjects.some(
        (pool) =>
          code.slice(0, 4) === pool.subject &&
          Number(code[4]) * 1000 >= pool.from &&
          Number(code[4]) * 1000 <= pool.to,
      ),
    )
  )
    return null;
  if (
    !hasSubjects ||
    !children.length ||
    lowerTotal > totalUnits ||
    upperTotal < totalUnits
  )
    return null;
  return {
    sourceText: text,
    sourceLocator: "Requirements",
    unmodelledText: [],
    rule: {
      type: "group",
      key: "structure",
      operator: "all_of",
      minimumCount: null,
      minimumUnits: totalUnits,
      maximumUnits: totalUnits,
      scope: "part",
      title: null,
      sourceText: text,
      sourceLocator: "Requirements",
      children,
    },
  };
}
