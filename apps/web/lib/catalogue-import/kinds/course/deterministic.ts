import { load, type CheerioAPI } from "cheerio";
import {
  COURSE_EXTRACTION_SCHEMA_VERSION,
  type CourseAssessmentItem,
  type CourseAttribute,
  type CourseExtraction,
  type CourseExtractionEvidence,
  type CourseExtractionReviewItem,
  type CourseFee,
  type CourseOfferingClass,
  type CourseRelatedCourse,
  type CourseRule,
  type CourseUnitValue,
  normaliseAnuClassSummaryUrl,
  parseCourseExtraction,
} from "./contract.ts";
import { validateAnuCoursePage } from "./source.ts";
import {
  parseRequisiteSummary,
  type RequisiteExpression,
} from "../../../coursemap/requisite-summary.ts";

const MONTHS = new Map(
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].map((month, index) => [month, index + 1]),
);

function cleanText(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalised = value
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalised || null;
}

function metadata($: CheerioAPI, name: string) {
  return cleanText($(`meta[name="${name}"]`).first().attr("content"));
}

function visibleDescription(value: string | null) {
  if (!value) return null;
  return cleanText(load(value).root().text());
}

function summaryFacts($: CheerioAPI) {
  const output = new Map<string, string[]>();
  const summary = $(".degree-summary.hide-mobile").first().length
    ? $(".degree-summary.hide-mobile").first()
    : $(".degree-summary").first();
  summary.find(".degree-summary__code").each((_, item) => {
    const label = cleanText(
      $(item).find(".degree-summary__code-heading").first().text(),
    );
    if (!label) return;
    const values = $(item)
      .find(".degree-summary__code-text")
      .toArray()
      .map((value) => cleanText($(value).text()))
      .filter((value): value is string => Boolean(value));
    output.set(label.toLowerCase(), [
      ...new Set(values.length > 0 ? values : [label]),
    ]);
  });
  return output;
}

function firstFact(facts: Map<string, string[]>, ...labels: string[]) {
  for (const label of labels) {
    const value = facts.get(label.toLowerCase())?.[0];
    if (value) return value;
  }
  return null;
}

function allFacts(facts: Map<string, string[]>, ...labels: string[]) {
  return labels.flatMap((label) => facts.get(label.toLowerCase()) ?? []);
}

function splitList(value: string | null) {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/\s*(?:,|;|\||\n)\s*/)
        .map((item) => cleanText(item))
        .filter((item): item is string => Boolean(item)),
    ),
  ];
}

function parseUnitValue(value: string | null): CourseUnitValue {
  if (!value) return { kind: "unknown" };
  const range = /(\d+(?:\.\d+)?)\s+(?:to|-)\s*(\d+(?:\.\d+)?)\s*units?/i.exec(
    value,
  );
  if (range) {
    return {
      kind: "range",
      minimumUnits: Number(range[1]),
      maximumUnits: Number(range[2]),
    };
  }
  const options =
    /(\d+(?:\.\d+)?)\s+(?:or|\/)\s*(\d+(?:\.\d+)?)\s*units?/i.exec(value);
  if (options) {
    return {
      kind: "variable",
      unitsOptions: [...new Set([Number(options[1]), Number(options[2])])].sort(
        (left, right) => left - right,
      ),
    };
  }
  const fixed = /(?:^|\b)(\d+(?:\.\d+)?)\s*units?\b/i.exec(value);
  return fixed
    ? { kind: "fixed", units: Number(fixed[1]) }
    : { kind: "unknown" };
}

function sectionRoot($: CheerioAPI, ids: readonly string[], headings: RegExp) {
  for (const id of ids) {
    const element = $(`#${id}`).first();
    if (element.length) return element;
  }
  return $("h2,h3")
    .filter((_, element) => headings.test(cleanText($(element).text()) ?? ""))
    .first();
}

function sectionNodes($: CheerioAPI, ids: readonly string[], headings: RegExp) {
  const root = sectionRoot($, ids, headings);
  if (!root.length) return root;
  return root.is("h2,h3") ? root.nextUntil("h2,h3") : root;
}

function sectionText($: CheerioAPI, ids: readonly string[], headings: RegExp) {
  return cleanText(sectionNodes($, ids, headings).text());
}

function sourceExcerpt(value: string | null, maximum = 500) {
  if (!value) return null;
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function parseMoney(value: string | null) {
  const amount = /\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(value ?? "")?.[1];
  return amount ? Number(amount.replace(/,/g, "")) : null;
}

function fees($: CheerioAPI, year: number) {
  const output: CourseFee[] = [];
  const root = sectionNodes($, ["fees"], /fees?/i);
  const pageText = cleanText(root.text()) ?? "";
  const broaderText = cleanText(
    [
      pageText,
      $("#indicative-fees__domestic").text(),
      $("#indicative-fees__international").text(),
    ].join(" "),
  );
  const feeYear = Number(
    /\b(20\d{2})\b(?=[^.]{0,50}\bfee)/i.exec(broaderText ?? "")?.[1],
  );
  const normalisedFeeYear = Number.isInteger(feeYear) ? feeYear : year;
  const band = Number(
    /Student Contribution Band\s*:?\s*(\d+)/i.exec(broaderText ?? "")?.[1],
  );
  if (Number.isInteger(band) && band > 0) {
    const sourceText =
      sourceExcerpt(
        /Student Contribution Band\s*:?\s*\d+/i.exec(broaderText ?? "")?.[0] ??
          null,
      ) ?? `Student Contribution Band: ${band}`;
    output.push({
      position: output.length + 1,
      feeYear: normalisedFeeYear,
      audience: "commonwealth_supported",
      feeType: "student_contribution",
      amount: null,
      currency: null,
      basis: "course",
      studentContributionBand: band,
      sourceLabel: "Student Contribution Band",
      sourceText,
    });
  }

  for (const [selector, audience, label] of [
    ["#indicative-fees__domestic", "domestic", "Domestic indicative fee"],
    [
      "#indicative-fees__international",
      "international",
      "International indicative fee",
    ],
  ] as const) {
    const text = cleanText($(selector).first().text());
    const amount = parseMoney(text);
    if (text && amount !== null) {
      output.push({
        position: output.length + 1,
        feeYear: normalisedFeeYear,
        audience,
        feeType: "indicative",
        amount,
        currency: "AUD",
        basis: "course",
        studentContributionBand: null,
        sourceLabel: label,
        sourceText: sourceExcerpt(text)!,
      });
    }
  }

  if (output.length === 0 && pageText) {
    output.push({
      position: 1,
      feeYear: normalisedFeeYear,
      audience: "other",
      feeType: "other",
      amount: null,
      currency: null,
      basis: "unknown",
      studentContributionBand: null,
      sourceLabel: "Fees",
      sourceText: sourceExcerpt(pageText)!,
    });
  }
  return output;
}

function learningOutcomes($: CheerioAPI) {
  const root = sectionNodes($, ["learning-outcomes"], /learning outcomes?/i);
  return root
    .find("li")
    .toArray()
    .map((item) => cleanText($(item).text()))
    .filter((item): item is string => Boolean(item))
    .map((text, index) => ({ position: index + 1, text }));
}

function assessmentItems($: CheerioAPI) {
  const root = sectionNodes(
    $,
    ["indicative-assessment", "assessment"],
    /(?:indicative )?assessment/i,
  );
  const candidates = [
    ...root.find("li").toArray(),
    ...root.find("tbody tr").toArray(),
  ];
  const seen = new Set<string>();
  const output: CourseAssessmentItem[] = [];
  for (const item of candidates) {
    const sourceText = cleanText($(item).text());
    if (!sourceText || seen.has(sourceText)) continue;
    seen.add(sourceText);
    const percent = Number(
      /(?:\(|\bweight\s*:?\s*)(\d+(?:\.\d+)?)\s*%?\)?/i.exec(sourceText)?.[1],
    );
    const weight =
      Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? percent
        : null;
    const learningOutcomePositions = [
      ...new Set(
        (
          /\[\s*LOs?\b\s*([^\]]*)\]/i.exec(sourceText)?.[1].match(/\d+/g) ?? []
        ).map(Number),
      ),
    ];
    const title =
      cleanText(
        sourceText
          .replace(/\s*\((?:\d+(?:\.\d+)?\s*%?|\d+\s*words?)\)/gi, "")
          .replace(/\s*\[LO(?:s)?[^\]]*\]/gi, "")
          .replace(/\bweight\s*:?\s*\d+(?:\.\d+)?\s*%?/gi, ""),
      ) ?? sourceText;
    const dueText = cleanText(/\bdue\s*:?\s*([^.;]+)/i.exec(sourceText)?.[0]);
    output.push({
      position: output.length + 1,
      title,
      weight,
      hurdle: /\bhurdle\b|must\s+pass/i.test(sourceText) ? true : null,
      dueText,
      sourceText,
      learningOutcomePositions,
    });
  }
  return output;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return value;
  const match = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})$/.exec(value);
  if (!match) return null;
  const month = MONTHS.get(match[2].slice(0, 3).toLowerCase());
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
}

function periodCode(periodName: string) {
  const normalised = periodName.toLowerCase();
  if (normalised.includes("first semester")) return "S1";
  if (normalised.includes("second semester")) return "S2";
  if (normalised.includes("summer")) return "SUMMER";
  if (normalised.includes("autumn")) return "AUTUMN";
  if (normalised.includes("winter")) return "WINTER";
  if (normalised.includes("spring")) return "SPRING";
  return `OTHER_${periodName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")}`;
}

function offeringClasses(
  $: CheerioAPI,
  year: number,
  sourceUrl: string,
  courseCode: string,
) {
  const yearAnchor = $(".course-tabs-menu a").filter(
    (_, item) => cleanText($(item).text()) === String(year),
  );
  const target = yearAnchor.first().attr("href");
  const panel =
    target && /^#[A-Za-z][\w-]*$/.test(target) ? $(target).first() : null;
  if (!panel?.length)
    return {
      observed: false,
      offerings: [] as CourseOfferingClass[],
      rejectedClassSummaryLinkCount: 0,
    };

  const offerings: CourseOfferingClass[] = [];
  let rejectedClassSummaryLinkCount = 0;
  panel.children("h3,h4").each((_, heading) => {
    const periodName = cleanText($(heading).text());
    if (!periodName) return;
    const table = $(heading).nextAll("table").first();
    if (!table.length) return;
    const headers = table
      .find("thead th")
      .toArray()
      .map((item) => cleanText($(item).text())?.toLowerCase() ?? "");
    const column = (...names: string[]) =>
      headers.findIndex((header) =>
        names.some((name) => header === name.toLowerCase()),
      );

    table.find("tbody tr").each((__, row) => {
      const cells = $(row).find("td").toArray();
      const value = (...names: string[]) => {
        const index = column(...names);
        return index >= 0 ? cleanText($(cells[index]).text()) : null;
      };
      const startsOn = parseDate(value("Class start date", "Start date"));
      const endsOn = parseDate(value("Class end date", "End date"));
      // A selected-year tab can contain stale rows from a future indicative
      // year. Store only rows whose dated values agree with the selected year.
      const observedYears = [startsOn, endsOn]
        .filter((date): date is string => Boolean(date))
        .map((date) => Number(date.slice(0, 4)));
      if (observedYears.some((observedYear) => observedYear !== year)) return;
      const classNumber = value("Class number", "Class no.");
      if (classNumber && !/^\d+$/.test(classNumber)) return;
      const summaryIndex = column("Class Summary", "Class summary link");
      const summaryHref =
        summaryIndex >= 0
          ? $(cells[summaryIndex]).find("a[href]").first().attr("href")
          : undefined;
      const classSummaryUrl = normaliseAnuClassSummaryUrl(summaryHref, {
        baseUrl: sourceUrl,
        expectedCourseCode: courseCode,
      });
      if (summaryHref && !classSummaryUrl) rejectedClassSummaryLinkCount += 1;
      const sourceText = cleanText($(row).text());
      if (!sourceText) return;
      offerings.push({
        position: offerings.length + 1,
        calendarYear: year,
        periodCode: periodCode(periodName),
        periodName,
        classNumber,
        startsOn,
        endsOn,
        lastEnrolmentDate: parseDate(
          value("Last day to enrol", "Last enrolment date"),
        ),
        censusDate: parseDate(value("Census date")),
        deliveryMode: value("Mode Of Delivery", "Mode of delivery"),
        location: value("Location"),
        classSummaryUrl,
        sourceText,
      });
    });
  });
  return { observed: true, offerings, rejectedClassSummaryLinkCount };
}

function courseRuleFromExpression(
  expression: RequisiteExpression,
  courseMode: "completed" | "completed_or_concurrent",
): CourseRule | null {
  switch (expression.kind) {
    case "course":
      return { op: courseMode, courseCode: expression.code };
    case "subject_units":
      return {
        op: "min_units_from_subject",
        minimumUnits: expression.units,
        subjectCode: expression.subject,
      };
    case "level_units":
      if (expression.subject) return null;
      return {
        op: "min_units_at_level",
        minimumUnits: expression.units,
        level: expression.level,
      };
    case "units_total":
      return {
        op: "min_units_total",
        minimumUnits: expression.units,
      };
    case "programme_enrolment":
      return { op: "enrolled_in", programmeCode: expression.code };
    case "group": {
      const rules = expression.conditions.map((condition) =>
        courseRuleFromExpression(condition, courseMode),
      );
      if (rules.some((rule) => rule === null)) return null;
      return {
        op: expression.operator === "all_of" ? "all_of" : "one_of",
        rules: rules as CourseRule[],
      };
    }
  }
}

function parseRuleText(
  sourceText: string | null,
  kind: "prerequisite" | "corequisite",
) {
  if (!sourceText) return null;
  let parseable = sourceText.replace(
    /^(?:pre-?requisites?|co-?requisites?)\s*:?\s*/iu,
    "",
  );
  if (kind === "corequisite") {
    parseable = parseable
      .replace(/^(?:students?|you)\s+(?:must\s+)?(?:be\s+)?/iu, "")
      .replace(
        /^(?:must\s+)?(?:be\s+)?(?:concurrently enrolled in|enrolled concurrently in|complete or be concurrently enrolled in)\s+/iu,
        "",
      );
  }
  const expression = parseRequisiteSummary(parseable);
  return expression
    ? courseRuleFromExpression(
        expression,
        kind === "corequisite" ? "completed_or_concurrent" : "completed",
      )
    : null;
}

function requisiteDetails($: CheerioAPI) {
  const sourceNodes = sectionNodes(
    $,
    ["incompatibility", "requisite-and-incompatibility", "requisites"],
    /requisite|incompatib/i,
  );
  const sourceText = cleanText(sourceNodes.text());
  if (!sourceText) {
    return {
      prerequisiteText: null,
      corequisiteText: null,
      incompatibilityText: null,
      prerequisiteRule: null,
      corequisiteRule: null,
      incompatibilityCourseCodes: [],
      softIncompatibilityCourseCodes: [],
      unmodelledText: [],
    };
  }
  // ANU often separates prerequisite and incompatibility prose with only a
  // line break or a new block element. Cheerio's `.text()` can collapse that
  // boundary, so also split before the explicit category phrases used by the
  // handbook. Without this, prerequisite course codes can be incorrectly
  // classified as incompatibilities.
  const categoryBoundary =
    /\s+(?=(?:you (?:are not able|cannot|must not)|students? (?:are not able|cannot|must not)|(?:this )?course is incompatib|incompatib(?:le|ility)|co-?requisite|concurrently enrolled|consent is not normally granted)\b)/i;
  const sentences = sourceText
    .split(new RegExp(`(?<=[.!?])\\s+|${categoryBoundary.source}`, "i"))
    .map((sentence) => cleanText(sentence))
    .filter((sentence): sentence is string => Boolean(sentence));
  const soft = sentences.filter((sentence) =>
    /consent is not normally granted/i.test(sentence),
  );
  const hard = sentences.filter(
    (sentence) =>
      !soft.includes(sentence) &&
      /\bincompatib|not (?:able|permitted) to enrol|cannot enrol/i.test(
        sentence,
      ),
  );
  const corequisite = sentences.filter(
    (sentence) =>
      !soft.includes(sentence) &&
      !hard.includes(sentence) &&
      /\bco-?requisite|concurrently enrolled/i.test(sentence),
  );
  const prerequisite = sentences.filter(
    (sentence) =>
      !soft.includes(sentence) &&
      !hard.includes(sentence) &&
      !corequisite.includes(sentence),
  );
  const codes = (items: string[]) => [
    ...new Set(
      items.flatMap(
        (item) => item.toUpperCase().match(/[A-Z]{4}\d{4}[A-Z]?/g) ?? [],
      ),
    ),
  ];
  const prerequisiteText = cleanText(prerequisite.join(" "));
  const corequisiteText = cleanText(corequisite.join(" "));
  return {
    prerequisiteText,
    corequisiteText,
    incompatibilityText: cleanText([...hard, ...soft].join(" ")),
    prerequisiteRule: parseRuleText(prerequisiteText, "prerequisite"),
    corequisiteRule: parseRuleText(corequisiteText, "corequisite"),
    incompatibilityCourseCodes: codes(hard),
    softIncompatibilityCourseCodes: codes(soft),
    unmodelledText: [],
  };
}

function relatedCourses(facts: Map<string, string[]>) {
  const source = allFacts(facts, "Co-taught Course", "Co-taught Courses").join(
    "; ",
  );
  const codes = source.toUpperCase().match(/[A-Z]{4}\d{4}[A-Z]?/g) ?? [];
  return [...new Set(codes)].map<CourseRelatedCourse>((courseCode, index) => ({
    position: index + 1,
    relationKind: "co_taught",
    courseCode,
    courseTitle: null,
    sourceText: source,
  }));
}

function attributes(facts: Map<string, string[]>) {
  const output: CourseAttribute[] = [];
  const graduateAttributes = allFacts(facts, "Graduate Attributes").flatMap(
    splitList,
  );
  for (const value of [...new Set(graduateAttributes)]) {
    output.push({
      position: output.length + 1,
      attributeKind: "graduate_attribute",
      value,
      sourceText: `Graduate Attributes: ${value}`,
    });
  }
  if (facts.has("stem course")) {
    output.push({
      position: output.length + 1,
      attributeKind: "stem",
      value: "STEM Course",
      sourceText: "STEM Course",
    });
  }
  return output;
}

export function extractDeterministicCourse({
  html,
  courseCode,
  year,
  sourceUrl,
}: {
  html: string;
  courseCode: string;
  year: number;
  sourceUrl: string;
}): CourseExtraction {
  const pageValidation = validateAnuCoursePage({
    html,
    expectedCourseCode: courseCode,
    expectedYear: year,
    requestedUrl: sourceUrl,
  });
  if (!pageValidation.valid) {
    throw new TypeError(
      `Cannot extract an invalid course page: ${pageValidation.issues.map(({ message }) => message).join(" ")}`,
    );
  }

  const $ = load(html);
  const facts = summaryFacts($);
  const evidence: CourseExtractionEvidence[] = [];
  const reviewItems: CourseExtractionReviewItem[] = [];
  const addEvidence = (
    fieldKey: string,
    sourceLocator: string,
    excerpt: string | null,
    confidence = 0.99,
  ) => {
    const evidenceExcerpt = sourceExcerpt(excerpt);
    if (!evidenceExcerpt) return;
    evidence.push({
      fieldKey,
      sourceLocator,
      evidenceExcerpt,
      confidence,
      method: "deterministic",
    });
  };

  const code = pageValidation.page.code;
  const title = pageValidation.page.title;
  const unitText = cleanText(
    $(".degree-summary__requirements-units").first().text(),
  );
  const unitValue = parseUnitValue(unitText);
  const eftslText = firstFact(
    facts,
    "EFTSL",
    "Equivalent Full-Time Student Load",
  );
  const eftsl = Number(/\d+(?:\.\d+)?/.exec(eftslText ?? "")?.[0]);
  const subjectName = firstFact(facts, "Course subject");
  const school = firstFact(facts, "Offered by");
  const college = firstFact(facts, "ANU College", "College");
  const careerText = firstFact(facts, "Academic career")?.toUpperCase() ?? null;
  const academicCareer =
    careerText === "UGRD" || careerText?.includes("UNDERGRAD")
      ? "UGRD"
      : careerText === "PGRD" || careerText?.includes("POSTGRAD")
        ? "PGRD"
        : careerText === "RSCH" || careerText?.includes("RESEARCH")
          ? "RSCH"
          : careerText
            ? "OTHER"
            : null;
  const convenerText =
    allFacts(facts, "Course convener", "Convener").join("; ") || null;
  const deliverySummary =
    allFacts(facts, "Mode of delivery").join("; ") || null;
  const introduction = sectionText(
    $,
    ["introduction"],
    /introduction|overview/i,
  );
  const description =
    visibleDescription(metadata($, "course-description")) ??
    cleanText($("#overview .body__inner").first().text());
  const workloadText = sectionText($, ["workload"], /workload/i);
  const workloadHours = Number(
    /\b(\d{1,4}(?:\.\d+)?)\s+hours?\b/i.exec(workloadText ?? "")?.[1],
  );
  const inherentRequirements = sectionText(
    $,
    ["inherent-requirements"],
    /inherent requirements?/i,
  );
  const prescribedTexts = sectionText(
    $,
    ["prescribed-texts"],
    /prescribed texts?/i,
  );
  const areasOfInterest = splitList(
    allFacts(facts, "Areas of interest").join(", "),
  );
  const extractedFees = fees($, year);
  const extractedOutcomes = learningOutcomes($);
  const extractedAssessment = assessmentItems($);
  for (const assessment of extractedAssessment) {
    const invalidPositions = assessment.learningOutcomePositions.filter(
      (position) => position < 1 || position > extractedOutcomes.length,
    );
    if (invalidPositions.length === 0) continue;
    assessment.learningOutcomePositions =
      assessment.learningOutcomePositions.filter(
        (position) => !invalidPositions.includes(position),
      );
    reviewItems.push({
      fieldKey: `assessmentItems.${assessment.position - 1}.learningOutcomePositions`,
      kind: "invalid",
      severity: "warning",
      message: `Assessment ${assessment.position} referenced unavailable learning outcome positions: ${invalidPositions.join(", ")}.`,
    });
  }
  const extractedOfferings = offeringClasses(
    $,
    year,
    pageValidation.page.canonicalUrl,
    code,
  );
  const requisites = requisiteDetails($);
  const extractedRelatedCourses = relatedCourses(facts);
  const extractedAttributes = attributes(facts);

  addEvidence("code", 'meta[name="course-code"]', code);
  addEvidence("year", 'meta[name="course-year"]', String(year));
  addEvidence("title", 'meta[name="course-name"]', title);
  addEvidence("unitValue", ".degree-summary__requirements-units", unitText);
  addEvidence("eftsl", ".degree-summary", eftslText);
  addEvidence("subjectName", ".degree-summary", subjectName);
  addEvidence("school", ".degree-summary", school);
  addEvidence("college", ".degree-summary", college);
  addEvidence("academicCareer", ".degree-summary", careerText);
  addEvidence("convenerText", ".degree-summary", convenerText);
  addEvidence("deliverySummary", ".degree-summary", deliverySummary);
  addEvidence("introduction", "#introduction", introduction);
  addEvidence("description", 'meta[name="course-description"]', description);
  addEvidence("workloadText", "#workload", workloadText);
  addEvidence("workloadHours", "#workload", workloadText);
  addEvidence(
    "inherentRequirements",
    "#inherent-requirements",
    inherentRequirements,
  );
  addEvidence("prescribedTexts", "#prescribed-texts", prescribedTexts);
  addEvidence("areasOfInterest", ".degree-summary", areasOfInterest.join(", "));
  addEvidence(
    "fees",
    "#fees",
    extractedFees.map((fee) => fee.sourceText).join(" "),
  );
  addEvidence(
    "learningOutcomes",
    "#learning-outcomes",
    extractedOutcomes.map(({ text }) => text).join(" "),
  );
  addEvidence(
    "assessmentItems",
    "#indicative-assessment",
    extractedAssessment.map(({ sourceText }) => sourceText).join(" "),
  );
  addEvidence(
    "offerings",
    `.course-tabs-menu:${year}`,
    extractedOfferings.offerings.map(({ sourceText }) => sourceText).join(" "),
  );
  addEvidence(
    "requisites.prerequisiteText",
    "#incompatibility",
    requisites.prerequisiteText,
  );
  if (requisites.prerequisiteRule) {
    addEvidence(
      "requisites.prerequisiteRule",
      "#incompatibility",
      requisites.prerequisiteText,
    );
  } else if (requisites.prerequisiteText) {
    reviewItems.push({
      fieldKey: "requisites.prerequisiteRule",
      kind: "ambiguous",
      severity: "warning",
      message:
        "The prerequisite wording could not be safely converted into a rule tree. The original wording was preserved for review.",
    });
  }
  addEvidence(
    "requisites.corequisiteText",
    "#incompatibility",
    requisites.corequisiteText,
  );
  if (requisites.corequisiteRule) {
    addEvidence(
      "requisites.corequisiteRule",
      "#incompatibility",
      requisites.corequisiteText,
    );
  } else if (requisites.corequisiteText) {
    reviewItems.push({
      fieldKey: "requisites.corequisiteRule",
      kind: "ambiguous",
      severity: "warning",
      message:
        "The corequisite wording could not be safely converted into a rule tree. The original wording was preserved for review.",
    });
  }
  addEvidence(
    "requisites.incompatibilityText",
    "#incompatibility",
    requisites.incompatibilityText,
  );
  addEvidence(
    "relatedCourses",
    ".degree-summary",
    extractedRelatedCourses.map(({ sourceText }) => sourceText).join(" "),
  );
  addEvidence(
    "attributes",
    ".degree-summary",
    extractedAttributes.map(({ sourceText }) => sourceText).join(" "),
  );

  if (unitValue.kind === "unknown") {
    reviewItems.push({
      fieldKey: "unitValue",
      kind: "missing",
      severity: "error",
      message: "The course unit value was not recognised.",
    });
  } else if (unitValue.kind !== "fixed") {
    reviewItems.push({
      fieldKey: "unitValue",
      kind: "ambiguous",
      severity: "warning",
      message:
        "The course has a variable unit value and must be confirmed before publication.",
    });
  }
  if (!extractedOfferings.observed) {
    reviewItems.push({
      fieldKey: "offerings",
      kind: "missing",
      severity: "warning",
      message: `No offering panel for ${year} was observed on the source page.`,
    });
  } else if (extractedOfferings.offerings.length === 0) {
    reviewItems.push({
      fieldKey: "offerings",
      kind: "missing",
      severity: "warning",
      message: `The ${year} offering panel contained no usable class rows.`,
    });
  }
  if (extractedOfferings.rejectedClassSummaryLinkCount > 0) {
    const count = extractedOfferings.rejectedClassSummaryLinkCount;
    reviewItems.push({
      fieldKey: "offerings",
      kind: "invalid",
      severity: "warning",
      message: `${count} class summary ${count === 1 ? "link was" : "links were"} not a valid same-course ANU URL and was omitted.`,
    });
  }

  const result: CourseExtraction = {
    schemaVersion: COURSE_EXTRACTION_SCHEMA_VERSION,
    code,
    year,
    title,
    unitValue,
    eftsl: Number.isFinite(eftsl) ? eftsl : null,
    level: Number(code.slice(4, 5)) * 1000,
    subjectCode: code.slice(0, 4),
    subjectName,
    school,
    college,
    academicCareer,
    convenerText,
    deliverySummary,
    introduction,
    description,
    workloadText,
    workloadHours: Number.isFinite(workloadHours) ? workloadHours : null,
    inherentRequirements,
    prescribedTexts,
    offeringStatus:
      extractedOfferings.offerings.length > 0
        ? "offered"
        : extractedOfferings.observed
          ? "not_offered"
          : "unknown",
    sourceUpdatedAt: null,
    areasOfInterest,
    fees: extractedFees,
    learningOutcomes: extractedOutcomes,
    assessmentItems: extractedAssessment,
    offerings: extractedOfferings.offerings,
    requisites,
    relatedCourses: extractedRelatedCourses,
    attributes: extractedAttributes,
    evidence,
    overallConfidence: reviewItems.some(({ severity }) => severity === "error")
      ? 0.75
      : 0.98,
    reviewItems,
  };
  return parseCourseExtraction(result, {
    expectedCode: code,
    expectedYear: year,
    evidenceMethod: "deterministic",
  });
}
