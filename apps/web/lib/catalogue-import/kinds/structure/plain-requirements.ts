import type {
  AcademicStructureRequirementCondition,
  AcademicStructureRequirements,
} from "./contract.ts";

function withoutEmphasis(line: string) {
  return line
    .trim()
    .replace(/^(\*{1,3})(.+)\1$/u, "$2")
    .replace(/\*+:\*+$/u, ":");
}

function readCourseRow(row: string, prerequisiteMarkers: boolean) {
  const text = withoutEmphasis(
    prerequisiteMarkers ? row.replace(/^\*(?=[A-Z]{4}\d{4} )/u, "") : row,
  );
  const match = text.match(/^([A-Z]{4}\d{4}[A-Z]?)\s+(?:[-–]\s*)?\S.+$/u);
  if (
    !match ||
    /[*\[\]]/u.test(text) ||
    (text.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu)?.length ?? 0) !== 1 ||
    /\b(?:except|excluding|permission|approval|only|must|may be|multiple times|more than once|substitute|in place of|subject to)\b/iu.test(
      text,
    )
  )
    return null;
  return {
    code: match[1]!,
    units: Number(text.match(/\((\d+) units\)$/iu)?.[1]) || null,
  };
}

function condition(
  key: string,
  codes: string[],
  minimum: number | null,
  maximum: number,
  source: string,
): AcademicStructureRequirementCondition {
  return {
    type: "condition",
    key,
    conditionKind: "course_list",
    minimumUnits: minimum,
    maximumUnits: maximum,
    minimumCourses: null,
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
    sourceText: source,
    sourceLocator: "Requirements",
  };
}

/** Accept complete allocations and level bounds; every source line must be accounted for. */
export function parsePlainStructureRequirements(
  text: string | null,
  totalUnits: number | null,
  prerequisiteMarkers = false,
): AcademicStructureRequirements | null {
  if (!text || !totalUnits) return null;
  const courseRow = (row: string) => readCourseRow(row, prerequisiteMarkers);
  const lines = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  // ANU sometimes places an explicit amount and one compulsory code on a line.
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i]!.match(
      /^(\d+) units (?:of |from\s*)([A-Z]{4}\d{4}[A-Z]? .+)$/iu,
    );
    if (inline && courseRow(inline[2]!)) {
      lines.splice(
        i,
        1,
        `${inline[1]} units from the following compulsory course:`,
        inline[2]!,
      );
      i++;
    }
  }
  const first = withoutEmphasis(lines[0] ?? "").replace(
    /^(The) (major|minor|specialisation) in ([\p{L} &-]+) requires /u,
    "$1 $3 $2 requires ",
  );
  const root = first
    .replace(
      / units which must be selected according to the following rules\.$/iu,
      " units, which must include:",
    )
    .match(
      /^(?:This|The) (?:[\p{L},& -]+ )?(?:major|minor|specialisation|specialization) requires the completion of (\d+) units(?: from the following lists?)?,? (?:which must (?:include|consist of(?: the following compulsory courses)?)|of which):$/iu,
    );
  const direct = first.match(
    /^(?:This|The) (?:[\p{L},& -]+ )?(?:major|minor|specialisation) requires the completion of (\d+) units from (?:completion of )?the following courses:$/iu,
  );
  const inlineLevel = first.match(
    /^(?:This|The) (?:[\p{L},& -]+ )?(?:major|minor|specialisation|specialization) requires the completion of (\d+) units, which must consist of a minimum of (\d+) units of (\d)000[ -]level courses\.$/iu,
  );
  if (root || direct || inlineLevel) {
    if (Number((root ?? direct ?? inlineLevel)![1]) !== totalUnits) return null;
    lines.shift();
  } else if (!/^\d+ units /iu.test(first)) return null;
  if (direct) lines.unshift(`${totalUnits} units from the following courses:`);
  if (inlineLevel)
    lines.unshift(
      `A minimum of ${inlineLevel[2]} units must come from completion of ${inlineLevel[3]}000-level courses`,
    );

  const allocations: AcademicStructureRequirementCondition[] = [];
  const levels: Array<{
    minimum: number | null;
    maximum: number;
    levels: number[];
    source: string;
  }> = [];
  const seen = new Set<string>();
  let minimumAllocated = 0;
  let maximumAllocated = 0;
  let variable = false;
  while (lines.length) {
    const heading = lines.shift()!;
    const clean = withoutEmphasis(heading).replace(/^Complete /iu, "");
    const subject = clean.match(
      /^(\d+) units from (?:the )?completion of (?:(\d)000-?\s*level [\p{L} &-]+ \(([A-Z]{4})\) courses|(?:further )?courses from the subject area ([A-Z]{4}) [\p{L} &-]+)$/u,
    );
    if (subject) {
      const amount = Number(subject[1]);
      if (!amount || amount > totalUnits) return null;
      const item = condition(
        `allocation-${allocations.length + 1}`,
        [],
        amount,
        amount,
        heading,
      );
      item.conditionKind = "subject";
      item.subjectCode = subject[3] ?? subject[4]!;
      item.minimumLevel = item.maximumLevel = subject[2]
        ? Number(subject[2]) * 1000
        : null;
      allocations.push(item);
      minimumAllocated += amount;
      maximumAllocated += amount;
      continue;
    }
    const restatement = clean.match(
      /^The (\d+) units must (?:consist of|include):$/iu,
    );
    if (restatement) {
      if (Number(restatement[1]) !== totalUnits || allocations.length)
        return null;
      continue;
    }
    const level = clean.match(
      /^A (minimum|maximum) of (\d+) units (?:must|may) come from (?:the )?completion of (?:courses at )?(\d)000(?: and (\d)000)?[ -]level(?: courses)?(?:,? and|\.)?$/iu,
    );
    if (level) {
      const amount = Number(level[2]);
      if (amount <= 0 || amount > totalUnits) return null;
      levels.push({
        minimum: level[1]!.toLowerCase() === "minimum" ? amount : null,
        maximum: level[1]!.toLowerCase() === "maximum" ? amount : totalUnits,
        levels: [Number(level[3]), ...(level[4] ? [Number(level[4])] : [])],
        source: heading,
      });
      continue;
    }
    const allocation = clean.match(
      /^(?:(A minimum of|A maximum of) )?(\d+)(?: units)?(?: and a maximum of (\d+))? units (.+?):?$/iu,
    );
    let minimum: number;
    let maximum: number;
    let compulsory = false;
    let singleCourse = false;
    let requiredLevel: number | null = null;
    const source = [heading];
    const rows: string[] = [];
    const lone = courseRow(heading);
    if (lone) {
      // A bare list under "must include" requires every listed course. A
      // partial bare list needs explicit units before a later allocation.
      rows.push(heading);
      while (lines.length && courseRow(lines[0]!)) rows.push(lines.shift()!);
      const parsed = rows.map((row) => courseRow(row)!);
      if (lines.length && parsed.some((row) => row.units === null)) return null;
      minimum = maximum = lines.length
        ? parsed.reduce((sum, row) => sum + row.units!, 0)
        : totalUnits - minimumAllocated;
      compulsory = true;
    } else {
      if (!allocation) return null;
      const amount = Number(allocation[2]);
      const lower = allocation[1]?.toLowerCase() === "a minimum of";
      const upper = allocation[1]?.toLowerCase() === "a maximum of";
      if (allocation[3] && !lower) return null;
      minimum = upper ? 0 : amount;
      maximum = allocation[3]
        ? Number(allocation[3])
        : lower
          ? totalUnits
          : amount;
      variable ||= Boolean(allocation[1]);
      const wording = allocation[4]!.replace(/:$/u, "");
      singleCourse = /\b(?:a course|one of the following courses)\b/iu.test(
        wording,
      );
      // Labels name the list, never qualify which rows count. Reject provisos.
      if (
        /\b(?:except|excluding|permission|approved|only|if|where|topic|subject to)\b/iu.test(
          wording,
        )
      )
        return null;
      const list = wording.match(
        /^(?:(?:from|of|must come from|may come from) (?:(?:the )?completion (?:of )?)?(?:(?:a course|course(?:s|\(s\))|[\p{L} &-]+ courses?|\d000-level courses) (?:from|on|in) the following (?:course )?list|(?:one of )?the following (?:[\p{L} &-]+ )?course(?:s|\(s\))?|the following (?:course )?list|the following|the courses|a research thesis|the thesis courses|compulsory course)|of courses from)$/iu,
      );
      if (!list) return null;
      compulsory = /\bcompulsory\b/iu.test(wording);
      const levelList = wording.match(/\b(\d)000-level courses/iu);
      if (levelList) requiredLevel = Number(levelList[1]);
      while (lines.length) {
        if (
          /^\*{3}[\p{L} -]+\*{3}$/u.test(lines[0]!) &&
          !/\b(?:must|required|except|only|minimum|maximum|units|choose|either|one|or|complete)\b/iu.test(
            lines[0]!,
          )
        ) {
          source.push(lines.shift()!);
          continue;
        }
        const row = lines[0]!;
        if (courseRow(row)) {
          rows.push(lines.shift()!);
          continue;
        }
        if (row === "| Code | Title | Units |" && !rows.length) {
          source.push(lines.shift()!);
          if (!/^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|$/u.test(lines[0] ?? ""))
            return null;
          source.push(lines.shift()!);
          while (lines[0]?.startsWith("|")) {
            const tableRow = lines.shift()!;
            const cells = tableRow.match(
              /^\|\s*([A-Z]{4}\d{4}[A-Z]?)\s*\|\s*([^|]+)\s*\|\s*(\d+)\s*\|$/u,
            );
            if (!cells) return null;
            source.push(tableRow);
            rows.push(`${cells[1]} ${cells[2]!.trim()} (${cells[3]} units)`);
          }
        }
        break;
      }
    }
    if (
      !rows.length ||
      minimum < 0 ||
      maximum <= 0 ||
      minimum > maximum ||
      maximum > totalUnits
    )
      return null;
    if (singleCourse) {
      // A single-course choice is only verified when every printed row has
      // the same explicit unit value as the requested amount.
      const amount = Number(allocation?.[2]);
      if (rows.some((row) => courseRow(row)?.units !== amount)) return null;
      maximum = amount;
    }
    if (
      compulsory &&
      rows.every((row) => courseRow(row)?.units !== null) &&
      rows.reduce((sum, row) => sum + (courseRow(row)?.units ?? 0), 0) !==
        minimum
    )
      return null;
    const codes: string[] = [];
    for (const row of rows) {
      const parsed = courseRow(row);
      if (!parsed || seen.has(parsed.code)) return null;
      if (requiredLevel !== null && Number(parsed.code[4]) !== requiredLevel)
        return null;
      seen.add(parsed.code);
      codes.push(parsed.code);
    }
    const item = condition(
      `allocation-${allocations.length + 1}`,
      codes,
      minimum || null,
      maximum,
      source.concat(rows).join("\n\n"),
    );
    if (compulsory) item.minimumCourses = codes.length;
    allocations.push(item);
    minimumAllocated += minimum;
    maximumAllocated += maximum;
  }
  if (
    !allocations.length ||
    minimumAllocated > totalUnits ||
    maximumAllocated < totalUnits
  )
    return null;
  if (!variable && minimumAllocated !== totalUnits) return null;
  if (
    (variable || levels.length) &&
    allocations.some((item) => item.conditionKind === "subject")
  )
    return null;
  if (variable) {
    // The union allocates courses once; bounds constrain those same lists.
    for (const item of allocations) item.scope = "degree";
    allocations.unshift(
      condition("listed-total", [...seen], totalUnits, totalUnits, text),
    );
  }
  for (const [index, level] of levels.entries()) {
    const codes = [...seen].filter((code) =>
      level.levels.includes(Number(code[4])),
    );
    if (!codes.length) {
      if (level.minimum) return null;
      continue;
    }
    const item = condition(
      `level-${index + 1}`,
      codes,
      level.minimum,
      level.maximum,
      level.source,
    );
    item.scope = "degree";
    const equivalent = allocations.find(
      (other) =>
        other.scope === "degree" &&
        other.minimumUnits === item.minimumUnits &&
        other.maximumUnits === item.maximumUnits &&
        other.minimumCourses === null &&
        other.courseCodes.length === codes.length &&
        other.courseCodes.every((code) => codes.includes(code)),
    );
    if (!equivalent) allocations.push(item);
  }
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
      children: allocations,
    },
  };
}
