import type { CourseRequisites, CourseRule } from "./contract.ts";

function requisiteSentences(text: string): string[] | null {
  const sentences: string[] = [];
  const source = text
    .trim()
    .replace(/\.(?=(?:You|To enrol|Incompatible|This course)\b)/gu, ". ");
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")") depth--;
    if (depth < 0) return null;
    if (
      depth === 0 &&
      ((source[i] === "." && /\s/u.test(source[i + 1] ?? "")) ||
        (source[i] === "\n" && source[i + 1] === "\n"))
    ) {
      const sentence = source.slice(start, i + 1).trim();
      if (sentence) sentences.push(sentence);
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  const last = source.slice(start).trim();
  if (last) sentences.push(last);
  return sentences;
}

/** Only a deliberately small, unambiguous grammar bypasses model interpretation. */
export function parsePlainCourseRequisites(
  text: string | null,
): CourseRequisites | null {
  const empty: CourseRequisites = {
    assumedKnowledgeText: null,
    prerequisiteText: text,
    corequisiteText: null,
    incompatibilityText: null,
    prerequisiteRule: null,
    corequisiteRule: null,
    incompatibilityRule: null,
    incompatibilityCourseCodes: [],
    softIncompatibilityCourseCodes: [],
    concurrentIncompatibilityCourseCodes: [],
    softConcurrentIncompatibilityCourseCodes: [],
    unmodelledText: [],
  };
  if (!text) return empty;
  if (/^(?:N\/A|Not applicable|None)\.?$/iu.test(text.trim()))
    return { ...empty, prerequisiteText: null };
  const list = (value: string): CourseRule | null => {
    const conjunctions = value.match(/\b(?:and|or)\b/gu) ?? [];
    if (new Set(conjunctions).size > 1) return null;
    if (
      !/^[A-Z]{4}\d{4}[A-Z]?(?:(?:\s*,?\s+(?:and|or)\s+|,\s*)[A-Z]{4}\d{4}[A-Z]?)*$/u.test(
        value,
      )
    )
      return null;
    const codes = value.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu) ?? [];
    const residue = value
      .replace(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu, "")
      .replace(/\b(?:and|or)\b/gu, "")
      .replace(/[\s,]/gu, "");
    if (
      residue ||
      !codes.length ||
      new Set(codes).size !== codes.length ||
      (codes.length > 1 && !conjunctions.length)
    )
      return null;
    const rules: CourseRule[] = codes.map((courseCode) => ({
      op: "completed",
      courseCode,
    }));
    return rules.length === 1
      ? rules[0]!
      : { op: conjunctions[0] === "or" ? "one_of" : "all_of", rules };
  };
  const expression = (value: string, depth = 0): CourseRule | null => {
    if (depth > 12) return null;
    value = value.replace(/^a minimum of /u, "");
    const unitClauses = value.split(" and ");
    if (
      unitClauses.length > 1 &&
      unitClauses.every((clause) => /^\d+ units /u.test(clause))
    ) {
      const rules = unitClauses.map((clause) => expression(clause, depth + 1));
      return rules.every((rule) => rule !== null)
        ? { op: "all_of", rules: rules as CourseRule[] }
        : null;
    }
    const explicitAlternatives = value.match(
      /^one of the following pre-requisite courses: (.+)$/u,
    );
    if (explicitAlternatives) {
      const alternatives = expression(explicitAlternatives[1]!, depth + 1);
      return alternatives?.op === "one_of" ? alternatives : null;
    }
    const subjectAlternatives = value.split(/, or /u);
    if (
      subjectAlternatives.length > 1 &&
      subjectAlternatives.every((part) => /^\d+ units /u.test(part))
    ) {
      const rules = subjectAlternatives.map((part) =>
        expression(part, depth + 1),
      );
      return rules.every((rule) => rule !== null)
        ? { op: "one_of", rules: rules as CourseRule[] }
        : null;
    }
    const requiredPermission = value.match(
      /^(.+?) and (seek permission of the conven[eo]r)$/u,
    );
    if (requiredPermission) {
      const required = expression(requiredPermission[1]!, depth + 1);
      return required
        ? {
            op: "all_of",
            rules: [
              required,
              { op: "permission", sourceText: requiredPermission[2]! },
            ],
          }
        : null;
    }
    const alternativeGroups = value.split(/,\s*or /u);
    if (alternativeGroups.length === 2) {
      const groups = alternativeGroups.map((group) => list(group));
      if (groups.every((group) => group?.op === "all_of"))
        return { op: "one_of", rules: groups as CourseRule[] };
    }
    const permission =
      value.match(
        /^(.+?),? or ((?:with|have received|by|have|seek)(?: the)? permission (?:of|from|by) (?:the )?(?:course )?[Cc]onven[eo]r)$/u,
      ) ??
      value.match(
        /^(.+?),? or ((?:with|have received)(?: the)? permission (?:of|from) the conven[eo]r)$/u,
      );
    if (permission) {
      const required = expression(permission[1]!, depth + 1);
      return required
        ? {
            op: "one_of",
            rules: [required, { op: "permission", sourceText: permission[2]! }],
          }
        : null;
    }
    const equivalent = value.match(
      /^(.+?),? or (have equivalent level of language proficiency as demonstrated by placement test)$/u,
    );
    if (equivalent) {
      const required = expression(equivalent[1]!, depth + 1);
      return required
        ? {
            op: "one_of",
            rules: [
              required,
              { op: "equivalent_course", sourceText: equivalent[2]! },
            ],
          }
        : null;
    }
    if (value.startsWith("either ")) {
      const alternatives = list(value.slice(7));
      return alternatives?.op === "one_of" ? alternatives : null;
    }
    const major = value.match(
      /^(.+?),? or (be currently studying (?:the )?[A-Za-z ']+ major \([A-Z0-9-]{3,20}\))$/u,
    );
    if (major) {
      const required = expression(major[1]!, depth + 1);
      return required
        ? {
            op: "one_of",
            rules: [
              required,
              { op: "external_requirement", sourceText: major[2]! },
            ],
          }
        : null;
    }
    const units = value.match(
      /^(?:at least |a minimum of )?(\d+) units(?: of courses| of prior tertiary study| of tertiary courses| of university courses| towards an ANU degree| of courses towards an ANU degree)?$/u,
    );
    if (units) return { op: "min_units_total", minimumUnits: Number(units[1]) };
    const exactLevel = value.match(
      /^(\d+) units of (\d{4})[- ]level courses$/u,
    );
    if (exactLevel)
      return {
        op: "min_units_at_level",
        minimumUnits: Number(exactLevel[1]),
        level: Number(exactLevel[2]),
        maximumLevel: Number(exactLevel[2]),
      };
    const subject = value.match(
      /^(\d+) units of ([A-Z]{4})[- ]coded courses$/u,
    );
    if (subject)
      return {
        op: "min_units_from_subject",
        minimumUnits: Number(subject[1]),
        subjectCode: subject[2]!,
      };
    const completedAndSubjectLevels = value.match(
      /^(.+?),? and (\d+) units of ([A-Z]{4}) coded courses at (\d{4}) or (\d{4}) level$/u,
    );
    if (completedAndSubjectLevels) {
      const courses = list(completedAndSubjectLevels[1]!);
      const level = Number(completedAndSubjectLevels[4]);
      const maximumLevel = Number(completedAndSubjectLevels[5]);
      if (!courses || courses.op === "one_of" || maximumLevel !== level + 1000)
        return null;
      return {
        op: "all_of",
        rules: [
          courses,
          {
            op: "min_units_at_level",
            minimumUnits: Number(completedAndSubjectLevels[2]),
            subjectCode: completedAndSubjectLevels[3]!,
            level,
            maximumLevel,
          },
        ],
      };
    }
    const namedSubject = value.match(
      /^(\d+) units of (?:an? )?[A-Za-z ]+ \(([A-Z]{4})\)(?: coded)? courses?$/u,
    );
    if (namedSubject)
      return {
        op: "min_units_from_subject",
        minimumUnits: Number(namedSubject[1]),
        subjectCode: namedSubject[2]!,
      };
    const reverseSubject = value.match(
      /^(\d+) units of ([A-Z]{4}) \([A-Za-z ]+\) coded courses$/u,
    );
    if (reverseSubject)
      return {
        op: "min_units_from_subject",
        minimumUnits: Number(reverseSubject[1]),
        subjectCode: reverseSubject[2]!,
      };
    if (
      /^of \d+ units in the field discipline \(e\.g\. [A-Z]{4}\)$/u.test(value)
    )
      return { op: "external_requirement", sourceText: value };
    const levelSubject = value.match(
      /^(\d+) units of (\d{4})[- ]level [A-Za-z ]+ \(([A-Z]{4})\) courses$/u,
    );
    if (levelSubject)
      return {
        op: "min_units_at_level",
        minimumUnits: Number(levelSubject[1]),
        level: Number(levelSubject[2]),
        maximumLevel: Number(levelSubject[2]),
        subjectCode: levelSubject[3]!,
      };
    // A quoted subject union or concurrent unit total remains a hard manual
    // check. Do not replace it with narrower per-subject totals or completed units.
    if (
      /^\d+ units of (?:\d{4}[- ]level )?[A-Za-z ]+ \([A-Z]{4} or [A-Z]{4}\) courses(?: or \d+ units of \d{4}[- ]level [A-Za-z ]+ \([A-Z]{4}\) or [A-Za-z ]+ \([A-Z]{4}\) courses)?$/u.test(
        value,
      ) ||
      /^or be currently studying \d+ units of \d{4}[- ]level [A-Za-z ]+ \([A-Z]{4}\) courses$/u.test(
        value,
      )
    )
      return { op: "external_requirement", sourceText: value };
    const subjectLevel = value.match(
      /^(\d+) units of (\d{4})[- ]level or (\d{4})[- ]level [A-Za-z ]+ \(([A-Z]{4})\) courses$/u,
    );
    if (
      subjectLevel &&
      Number(subjectLevel[3]) === Number(subjectLevel[2]) + 1000
    )
      return {
        op: "min_units_at_level",
        minimumUnits: Number(subjectLevel[1]),
        level: Number(subjectLevel[2]),
        maximumLevel: Number(subjectLevel[3]),
        subjectCode: subjectLevel[4]!,
      };
    // A stated 'either' binds the alternatives after an explicit all-of clause.
    const scoped = value.match(/^([A-Z]{4}\d{4}),? and either (.+)$/u);
    if (scoped) {
      const alternatives = list(scoped[2]!);
      return alternatives?.op === "one_of"
        ? {
            op: "all_of",
            rules: [{ op: "completed", courseCode: scoped[1]! }, alternatives],
          }
        : null;
    }
    return list(value);
  };
  const sentences = requisiteSentences(text);
  if (!sentences) return null;
  for (const printedSentence of sentences) {
    const sentence = printedSentence.replace(/\.+$/u, ".");
    if (
      /^If you do not meet the pre-requisites for this course or have problems enrolling, please contact cap\.student@anu\.edu\.au\.?$/u.test(
        sentence,
      )
    )
      continue;
    const enrolledAndCompleted = sentence.match(
      /^To enrol in this course you must be enrolled in (?:the |a )?Bachelor of [A-Za-z ']+(?: \(Honours\))? \(([A-Z0-9-]{3,20})\) and have completed ([A-Z]{4}\d{4})\.?$/u,
    );
    if (enrolledAndCompleted && !empty.prerequisiteRule) {
      empty.prerequisiteRule = {
        op: "all_of",
        rules: [
          { op: "enrolled_in", programmeCode: enrolledAndCompleted[1]! },
          { op: "completed", courseCode: enrolledAndCompleted[2]! },
        ],
      };
      continue;
    }
    const eitherProgramme = sentence.match(
      /^You must be enrolled in either (.+?)\.?$/u,
    );
    if (eitherProgramme && !empty.prerequisiteRule) {
      const parts = eitherProgramme[1]!.split(/,\s*(?:or )?| or /u);
      const rules: CourseRule[] = [];
      for (const part of parts) {
        const match = part.match(
          /^(?:a )?Bachelor of [A-Za-z ']+(?: \(Honours\))? \(([A-Z0-9-]{3,20})\)$/u,
        );
        if (!match) return null;
        rules.push({ op: "enrolled_in", programmeCode: match[1]! });
      }
      if (
        rules.length < 2 ||
        new Set(
          rules.map((rule) =>
            rule.op === "enrolled_in" ? rule.programmeCode : null,
          ),
        ).size !== rules.length
      )
        return null;
      empty.prerequisiteRule = { op: "one_of", rules };
      continue;
    }
    const enrolledOrCompleted = sentence.match(
      /^You are not able to enrol in this course if you are enrolled in, or have previously completed (.+?)(?: \([A-Za-z &]+\))?\.?$/u,
    );
    if (
      enrolledOrCompleted &&
      !empty.incompatibilityCourseCodes.length &&
      !empty.concurrentIncompatibilityCourseCodes?.length
    ) {
      const rule = list(enrolledOrCompleted[1]!);
      if (!rule || rule.op === "all_of") return null;
      const codes = enrolledOrCompleted[1]!.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu)!;
      empty.incompatibilityCourseCodes = codes;
      empty.concurrentIncompatibilityCourseCodes = [...codes];
      empty.incompatibilityText = sentence;
      continue;
    }
    const programmeList = sentence.match(
      /^To enrol in this course you must be studying one of the following programs, or with permission of the convener: (.+?)\.?$/u,
    );
    if (programmeList && !empty.prerequisiteRule) {
      const remaining = programmeList[1]!;
      const matches = [
        ...remaining.matchAll(
          /(?:^| )((?:Master|Graduate Certificate|Bachelor)[A-Za-z ']*(?: \((?:Advanced|Honours)\))?) \(([A-Z0-9-]{3,20})\)(?= |$)/gu,
        ),
      ];
      if (
        matches.length < 2 ||
        remaining
          .replace(
            /(?:^| )((?:Master|Graduate Certificate|Bachelor)[A-Za-z ']*(?: \((?:Advanced|Honours)\))?) \(([A-Z0-9-]{3,20})\)(?= |$)/gu,
            "",
          )
          .trim()
      )
        return null;
      const rules: CourseRule[] = matches.map((match) => ({
        op: "enrolled_in",
        programmeCode: match[2]!,
      }));
      if (new Set(matches.map((match) => match[2])).size !== matches.length)
        return null;
      empty.prerequisiteRule = {
        op: "one_of",
        rules: [
          ...rules,
          { op: "permission", sourceText: "with permission of the convener" },
        ],
      };
      continue;
    }
    const studying = sentence.match(
      /^To enrol in this course you must be (?:studying|enrolled in) (.+?)\.?$/u,
    );
    if (studying && !empty.prerequisiteRule && !studying[1]!.startsWith(":")) {
      const programmes = studying[1]!.split(" or ");
      const rules: CourseRule[] = [];
      for (const programme of programmes) {
        // The printed code must follow the complete name, including honours.
        const match = programme.match(
          /^[A-Za-z ']+(?: \(Honours\))? \(([A-Z0-9-]{3,20})\)$/u,
        );
        if (!match) return null;
        rules.push({ op: "enrolled_in", programmeCode: match[1]! });
      }
      empty.prerequisiteRule =
        rules.length === 1 ? rules[0]! : { op: "one_of", rules };
      continue;
    }
    const qualifiedExclusions = sentence.match(
      /^Unless an arrangement has been made with (?:the )?[Cc]ourse [Cc]onven[eo]r, students may not enroll? in this course (?:should they have|if they have) previously completed (.+?)\.?$/u,
    );
    if (
      qualifiedExclusions &&
      !empty.incompatibilityRule &&
      !empty.incompatibilityCourseCodes.length
    ) {
      const exclusions = list(qualifiedExclusions[1]!);
      if (!exclusions || exclusions.op === "all_of") return null;
      const codes = qualifiedExclusions[1]!.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu)!;
      const rules = codes.map((courseCode) => ({
        op: "not_completed" as const,
        courseCode,
      }));
      empty.incompatibilityRule = {
        op: "one_of",
        rules: [
          rules.length === 1 ? rules[0]! : { op: "all_of", rules },
          { op: "permission", sourceText: sentence },
        ],
      };
      empty.incompatibilityText = sentence;
      continue;
    }
    const applicationGpa = sentence.match(
      /^Enrolment in this course is selective and determined by an \[application process\]\(https?:\/\/[^)]+\) which requires a minimum GPA of (\d+(?:\.\d+)?)\.$/u,
    );
    if (applicationGpa) {
      const gpa: CourseRule = {
        op: "minimum_gpa",
        value: Number(applicationGpa[1]),
        scale: "anu7",
      };
      empty.prerequisiteRule = empty.prerequisiteRule
        ? { op: "all_of", rules: [empty.prerequisiteRule, gpa] }
        : gpa;
      continue;
    }
    const enrolled = sentence.match(
      /^To enrol in this course you must be enrolled in: (.+?)\.?$/u,
    );
    if (enrolled && !empty.prerequisiteRule) {
      const parts = enrolled[1]!.split(/\s*•\s*/u);
      if (
        parts.shift() !== "" ||
        parts.length < 2 ||
        !/\) or •/u.test(enrolled[1]!)
      )
        return null;
      const rules: CourseRule[] = [];
      for (const part of parts) {
        const programme = part.match(
          /^[^()]+ \(([A-Z0-9-]{3,20})\)(?:,| or)?$/u,
        );
        if (!programme) return null;
        rules.push({ op: "enrolled_in", programmeCode: programme[1]! });
      }
      empty.prerequisiteRule = { op: "one_of", rules };
      continue;
    }
    const permissionContact =
      sentence.match(
        /^To receive consent for enrolment, students need to apply via (?:the )?(?:\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/\S+)\.?$/u,
      ) ??
      sentence.match(
        /^You will need to contact .+ to request a permission code to enrol in this course\.$/u,
      );
    if (permissionContact) {
      const requiredPermission = (
        rule: CourseRule | null,
      ): Extract<CourseRule, { op: "permission" }> | null => {
        if (rule?.op === "permission") return rule;
        if (rule?.op === "all_of")
          for (const child of rule.rules) {
            const found = requiredPermission(child);
            if (found) return found;
          }
        return null;
      };
      const existing = requiredPermission(empty.prerequisiteRule);
      if (existing) {
        // Repeated instructions describe the same required course consent. Keep
        // both instructions on that condition, and the full original raw text.
        existing.sourceText = [existing.sourceText, sentence]
          .filter(Boolean)
          .join("\n\n");
        continue;
      }
      const permission: CourseRule = { op: "permission", sourceText: sentence };
      empty.prerequisiteRule = empty.prerequisiteRule
        ? { op: "all_of", rules: [empty.prerequisiteRule, permission] }
        : permission;
      continue;
    }
    const additionalCompletion = sentence.match(
      /^You must also have completed (.+?)\.?$/u,
    );
    if (additionalCompletion && empty.prerequisiteRule) {
      const rule = expression(additionalCompletion[1]!);
      if (!rule) return null;
      empty.prerequisiteRule = {
        op: "all_of",
        rules: [empty.prerequisiteRule, rule],
      };
      continue;
    }
    const prerequisite = sentence.match(
      /^(?:To enrol|In order to enrol) (?:in|into) (?:this|the) course,? (?:you|students) must have (?:successfully )?completed (.+?)\.?$/u,
    );
    const incompatibility = sentence.match(
      /^(?:Incompatible with|This course is incompatible with|This course is not compatible with|You are not able to enrol in this course if you have (?:previously )?completed) (?:any of the following courses: )?([^.]+)\.?$/u,
    );
    const slashExclusions = sentence.match(
      /^You are not able to enrol in this course if you have previously completed ([A-Z]{4}\d{4}(?: \/ [A-Z]{4}\d{4})+)\.?$/u,
    );
    if (
      slashExclusions &&
      !empty.incompatibilityRule &&
      !empty.incompatibilityCourseCodes.length
    ) {
      empty.incompatibilityCourseCodes = slashExclusions[1]!.split(" / ");
      empty.incompatibilityText = sentence;
      continue;
    }
    if (prerequisite && !empty.prerequisiteRule) {
      const rule = expression(prerequisite[1]!);
      if (!rule) return null;
      empty.prerequisiteRule = rule;
    } else if (incompatibility && !empty.incompatibilityCourseCodes.length) {
      const rule = list(incompatibility[1]!);
      if (!rule) return null;
      if (
        !sentence.startsWith("Incompatible with") &&
        !sentence.startsWith("This course is incompatible with") &&
        rule.op === "all_of"
      )
        return null;
      empty.incompatibilityText = sentence;
      empty.incompatibilityCourseCodes = incompatibility[1]!.match(
        /\b[A-Z]{4}\d{4}[A-Z]?\b/gu,
      )!;
      if (
        /^(?:Incompatible with|This course is (?:incompatible|not compatible) with) /u.test(
          sentence,
        )
      )
        empty.concurrentIncompatibilityCourseCodes = [
          ...empty.incompatibilityCourseCodes,
        ];
    } else return null;
  }
  return empty;
}
