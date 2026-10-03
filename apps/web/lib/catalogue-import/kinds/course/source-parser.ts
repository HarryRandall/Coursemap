import { emptyCourseExtraction } from "./finalise.ts";
import { parsePlainCourseRequisites } from "./plain-requisites.ts";
import type { CourseExtraction, CourseOfferingClass } from "./contract.ts";
import type { PromptContext } from "../../../catalogue-sync/kind-adapter.ts";

// Student-facing fields are plain text. Preserve labels without exposing the
// Markdown link targets and emphasis used in the captured source artefact.
function courseDisplayText(text: string | null): string | null {
  return (
    text
      ?.replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .replace(/\*\*([^*]+)\*\*/gu, "$1 ")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu, "$1")
      .trim() ?? null
  );
}

function hasEnrolmentRequirement(text: string) {
  const printed = courseDisplayText(text) ?? "";
  return /\b(?:must (?:have|be|complete|submit)|only available|minimum (?:GPA|mark|grade)|eligibility criteria|prerequisite|incompatible)|\benrol\w*[^.\n]*(?:subject to|permission|required)|\b(?:permission|consent)[^.\n]*enrol/iu.test(
    printed,
  );
}

/** Copy printed facts before asking a model to interpret eligibility wording. */
export function parseCourseSource({
  code,
  year,
  markdown,
  context,
}: {
  code: string;
  year: number;
  markdown: string;
  context?: PromptContext;
}): CourseExtraction {
  const section = (heading: string) =>
    markdown.split(`## ${heading}\n`)[1]?.split(/^## /mu)[0]?.trim() ?? null;
  const field = (label: string) =>
    markdown.match(new RegExp(`^- ${label} (.+)$`, "mu"))?.[1]?.trim() ?? null;
  const title = markdown.match(/^# (.+)$/mu)?.[1] ?? null;
  const course = emptyCourseExtraction({ code, year, title });
  const review = (
    fieldKey: string,
    message: string,
    severity: "warning" | "error" = "error",
  ) => {
    course.reviewItems.push({
      fieldKey,
      kind: "unsupported",
      severity,
      message,
    });
  };
  const evidence = (fieldKey: string, text: string | null) => {
    if (text)
      course.evidence.push({
        fieldKey,
        sourceLocator: fieldKey,
        evidenceExcerpt: text,
        confidence: 1,
        method: "deterministic",
      });
  };
  evidence("title", title);
  if (!title)
    review("title", "The course title could not be read from the source.");
  const units = field("Unit Value");
  const fixed = units?.match(/^(\d+(?:\.\d+)?) units?$/u);
  const range = units?.match(
    /^(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?) units?$/u,
  );
  if (fixed) course.unitValue = { kind: "fixed", units: Number(fixed[1]) };
  else if (range)
    course.unitValue = {
      kind: "range",
      minimumUnits: Number(range[1]),
      maximumUnits: Number(range[2]),
    };
  else review("unitValue", "The printed unit value needs review.");
  evidence("unitValue", units);
  course.school = field("Offered by");
  course.college = field("ANU College");
  course.subjectName = field("Course subject");
  const career = field("Academic career");
  if (
    career === "UGRD" ||
    career === "PGRD" ||
    career === "RSCH" ||
    career === "OTHER"
  )
    course.academicCareer = career;
  else
    review(
      "academicCareer",
      "The academic career could not be read from the source.",
    );
  course.convenerText = field("Course convener")?.replace(/^- /u, "") ?? null;
  course.deliverySummary = field("Mode of delivery");
  course.areasOfInterest = field("Areas of interest")?.split(/,\s*/u) ?? [];
  const coTaught = field("Co-taught Course");
  if (coTaught) {
    const codes = coTaught.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu) ?? [];
    course.relatedCourses = codes.map((courseCode, i) => ({
      position: i + 1,
      relationKind: "co_taught",
      courseCode,
      courseTitle: null,
      sourceText: coTaught,
    }));
    if (!codes.length)
      review("relatedCourses", "The co-taught course identity needs review.");
  }
  const supportedHeadings = new Set([
    "Learning Outcomes",
    "Areas of Interest",
    "Indicative Assessment",
    "Workload",
    "Inherent Requirements",
    "Requisite and Incompatibility",
    "Assumed Knowledge",
    "Prescribed Texts",
    "Preliminary Reading",
    "Work Integrated Learning",
    "Other Information",
    "Fees",
    "Majors",
    "Minors",
    "Specialisations",
    "Course fees",
    "Offerings, Dates and Class Summary Links",
  ]);
  const areaSection = section("Areas of Interest");
  if (areaSection) {
    const lines = areaSection.split(/\n/u).filter((line) => line.trim());
    if (lines.every((line) => /^- [A-Za-z][A-Za-z ,&'/-]*$/u.test(line))) {
      course.areasOfInterest = [
        ...new Set([
          ...course.areasOfInterest,
          ...lines.map((line) => line.slice(2)),
        ]),
      ];
    } else
      review("areasOfInterest", "The areas of interest list needs review.");
  }
  const supplementaryRequisites: string[] = [];
  for (const heading of markdown.matchAll(/^## (.+)$/gmu)) {
    if (supportedHeadings.has(heading[1]!)) continue;
    if (/^(?:N\/A|Not applicable|None)\.?$/iu.test(section(heading[1]!) ?? ""))
      continue;
    const paragraphs = (section(heading[1]!) ?? "").split(/\n\n/u);
    const applicationInstructions = paragraphs.filter((text) =>
      /^To receive consent for enrolment, students need to apply via (?:the )?(?:\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/\S+)\.?$/u.test(
        text,
      ),
    );
    supplementaryRequisites.push(...applicationInstructions);
    const remaining = paragraphs
      .filter((text) => !applicationInstructions.includes(text))
      .join("\n\n");
    for (const paragraph of paragraphs.filter(
      (text) => !applicationInstructions.includes(text),
    ))
      if (
        /(?:must|eligible|enrol|permission|prerequisit|incompatib|only available|minimum (?:GPA|mark|grade))/iu.test(
          paragraph,
        )
      )
        supplementaryRequisites.push(paragraph);
    review(
      /(?:must|eligible|enrol|permission|prerequisit|incompatib|only available|minimum (?:GPA|mark|grade))/iu.test(
        remaining,
      )
        ? "requisites"
        : "supplementarySections",
      `The source section '${heading[1]}' is preserved for review.`,
      "warning",
    );
  }
  const attributes =
    field("Graduate Attributes")?.replace(/^- /u, "").split(/ - /u) ?? [];
  course.attributes = attributes.map((value, i) => ({
    position: i + 1,
    attributeKind: "graduate_attribute",
    value,
    sourceText: value,
  }));
  // A graduate attribute is not automatically a recognised degree tag.
  if (attributes.some((value) => /transdisciplinary/iu.test(value)))
    review(
      "tags",
      "Confirm whether the printed Transdisciplinary attribute satisfies the degree's problem-solving tag.",
      "warning",
    );
  course.tags = (context?.knownTags ?? []).filter((tag) =>
    attributes.includes(tag),
  );
  const beforeOutcomes = markdown.split(/^## Learning Outcomes/mu)[0];
  const introductionBoundary = [
    ...(beforeOutcomes ?? "").matchAll(
      /^- (?:Offerings and Dates|Fees)\s*$/gmu,
    ),
  ].at(-1);
  course.description =
    introductionBoundary && beforeOutcomes
      ? (beforeOutcomes
          .slice(introductionBoundary.index + introductionBoundary[0].length)
          .split(/^## /mu)[0]
          ?.trim() ?? null)
      : null;
  course.description = courseDisplayText(course.description);
  course.description =
    course.description
      ?.split("\n\n")
      .filter(
        (paragraph) =>
          !paragraph.startsWith(
            "The ANU uses Turnitin to enhance student citation and referencing techniques",
          ),
      )
      .join("\n\n")
      .trim() || null;
  course.introduction = course.description;
  if (
    course.description &&
    /(?:must|should) have (?:achieved|completed)|students enrolling|only available to/iu.test(
      course.description,
    )
  )
    review(
      "requisites",
      "The introduction includes eligibility wording that needs review alongside the requisite section.",
    );
  if (!course.description)
    review("description", "The introduction layout needs review.");
  course.workloadText = section("Workload");
  const integratedLearning = section("Work Integrated Learning");
  if (integratedLearning) {
    course.workloadText = [
      course.workloadText,
      `Work Integrated Learning\n${integratedLearning}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (hasEnrolmentRequirement(integratedLearning))
      supplementaryRequisites.push(integratedLearning);
  }
  const otherInformation = section("Other Information");
  if (
    otherInformation &&
    !/^(?:N\/A|Not applicable|None)\.?$/iu.test(otherInformation)
  ) {
    // Preserve administrative and materials information under its printed label,
    // alongside study expectations, without polluting the academic description.
    course.workloadText = [
      course.workloadText,
      `Other Information\n${otherInformation}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    for (const paragraph of otherInformation.split("\n\n"))
      if (hasEnrolmentRequirement(paragraph)) {
        supplementaryRequisites.push(paragraph);
        if (!parsePlainCourseRequisites(paragraph))
          review(
            "requisites",
            "The other information section includes eligibility wording that needs review.",
          );
      }
  }
  const hours = course.workloadText?.match(
    /^(\d+(?:\.\d+)?) hours in total\b/iu,
  );
  if (hours) {
    course.workloadHours = Number(hours[1]);
    course.workloadHoursBasis = "total";
  }
  course.inherentRequirements = section("Inherent Requirements");
  course.prescribedTexts = section("Prescribed Texts");
  const preliminaryReading = section("Preliminary Reading");
  if (preliminaryReading) {
    course.prescribedTexts = [
      course.prescribedTexts,
      `Preliminary Reading\n${preliminaryReading}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (hasEnrolmentRequirement(preliminaryReading)) {
      supplementaryRequisites.push(preliminaryReading);
      review(
        "requisites",
        "The preliminary reading section includes eligibility wording that needs review.",
      );
    }
  }
  course.requisites.assumedKnowledgeText = section("Assumed Knowledge");
  for (const sentence of course.requisites.assumedKnowledgeText?.split(
    /(?<=\.)\s+/u,
  ) ?? []) {
    if (
      /^Completion of [A-Z]{4}\d{4} is recommended but not required\.$/u.test(
        sentence,
      ) ||
      /^No prior knowledge of [A-Za-z ]+ is required\.?$/u.test(sentence) ||
      /^No previous knowledge or skill in [A-Za-z ]+ required\.$/u.test(
        sentence,
      )
    )
      continue;
    // This exact ANU preparedness statement describes assumed knowledge, not
    // an enrolment threshold. Quantified or other mandatory wording stays hard.
    if (
      /^Students must be able and prepared to engage with art historical discourse and research at a level appropriate to the chosen course\.$/u.test(
        sentence,
      )
    )
      continue;
    if (
      /^Enrolment in this course is selective and determined by an \[application process\]\(https?:\/\/[^)]+\) which requires a minimum GPA of \d+(?:\.\d+)?\.$/u.test(
        sentence,
      )
    )
      supplementaryRequisites.push(sentence);
    else if (
      /\b(?:must|required|requires|minimum GPA|only available)\b/iu.test(
        sentence,
      )
    ) {
      supplementaryRequisites.push(sentence);
      review(
        "requisites",
        "The assumed knowledge section includes mandatory eligibility wording that needs review.",
      );
    }
  }
  const requisite =
    [
      section("Requisite and Incompatibility"),
      ...supplementaryRequisites,
      ...(course.reviewItems.some((item) =>
        item.message.startsWith("The introduction includes eligibility"),
      )
        ? [course.description]
        : []),
    ]
      .filter(Boolean)
      .join("\n\n") || null;
  const enrolmentHelp = requisite?.match(
    /If you do not meet the pre-requisites for this course or have problems enrolling, please contact cap\.student@anu\.edu\.au\.?/u,
  )?.[0];
  if (enrolmentHelp)
    course.workloadText = [course.workloadText, enrolmentHelp]
      .filter(Boolean)
      .join("\n\n");
  course.requisites.prerequisiteText = requisite;
  evidence("requisiteSource", requisite ?? title);
  course.learningOutcomes = (
    section("Learning Outcomes")?.match(/^(?:- |\d+[.)] ).+$/gmu) ?? []
  ).map((text, i) => ({
    position: i + 1,
    text: courseDisplayText(text.replace(/^(?:- |\d+[.)] )/u, ""))!,
  }));
  if (!course.learningOutcomes.length)
    review(
      "learningOutcomes",
      "No learning outcomes were read from the source.",
    );
  const assessment = section("Indicative Assessment");
  const assessmentLines = (assessment?.split("\n") ?? []).filter(
    (line) =>
      /^- .+/u.test(line) ||
      /\(\d+(?:\.\d+)?%?\)\s*\[(?:LO|Learning Outcomes?) [\d, ]+\]$/u.test(
        line,
      ),
  );
  course.assessmentItems = assessmentLines.map((text, i) => {
    const value = text.replace(/^- /u, "");
    const weight = value.match(
      /\((\d+(?:\.\d+)?)%?\)\s*(?:\[(?:LO|Learning Outcomes?)[^\]]*\])?$/u,
    );
    const outcomes =
      value
        .match(/\[(?:LO|Learning Outcomes?) ([\d, ]+)\]/u)?.[1]
        ?.split(",")
        .map(Number) ?? [];
    return {
      position: i + 1,
      title: courseDisplayText(
        value.replace(
          /\s*\(\d+(?:\.\d+)?%?\)\s*(?:\[(?:LO|Learning Outcomes?)[^\]]*\])?$/u,
          "",
        ),
      )!,
      weight: weight ? Number(weight[1]) : null,
      hurdle: null,
      dueText: null,
      sourceText: value,
      learningOutcomePositions: outcomes,
    };
  });
  if (!course.assessmentItems.length)
    review("assessmentItems", "The assessment layout needs review.");
  const fees = section("Course fees");
  for (const audience of ["domestic", "international"] as const) {
    const label =
      audience === "domestic"
        ? "Domestic fee paying students"
        : "International fee paying students";
    const table = fees?.split(`**${label}:**`)[1]?.split(/^- \*\*/mu)[0];
    const amount = table?.match(
      new RegExp(
        `^\\| ${year} \\| \\$((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)( per unit)? *\\|$`,
        "mu",
      ),
    );
    if (amount)
      course.fees.push({
        position: course.fees.length + 1,
        feeYear: year,
        audience,
        feeType: "tuition",
        amount: Number(amount[1]!.replaceAll(",", "")),
        currency: "AUD",
        basis: amount[2] ? "unit" : "course",
        studentContributionBand: null,
        sourceLabel: label,
        sourceText: amount[0],
      });
    else review("fees", `${label} could not be read from the source.`);
  }
  const feeSection = section("Fees");
  const band = feeSection?.match(
    /\*\*Student Contribution Band:\*\* \[([A-Z0-9]+)\]/u,
  );
  // ANU prints combined cohort codes, not just the four HECS bands. Keep the
  // literal code; never choose a cohort or calculate a student's charge here.
  // https://www.anu.edu.au/student-contributions (2026 band allocations)
  const recognisedBand =
    band && new Set(["1", "2", "3", "4", "12", "14", "34", "4B"]).has(band[1]!);
  if (band && !recognisedBand)
    review(
      "fees.studentContributionBand",
      "The printed ANU contribution-band code is not recognised and needs review.",
      "warning",
    );
  if (band)
    course.fees.push({
      position: course.fees.length + 1,
      feeYear: year,
      audience: "commonwealth_supported",
      feeType: "student_contribution",
      amount: null,
      currency: "AUD",
      basis: "unknown",
      studentContributionBand:
        recognisedBand && /^\d+$/u.test(band[1]!) ? Number(band[1]) : null,
      sourceLabel: `Student Contribution Band Code ${band[1]}`,
      sourceText: band[0],
    });
  const eftsl = feeSection?.match(
    /^\| \d+(?:\.\d+)? +\| (\d+(?:\.\d+)?) *\|$/mu,
  );
  if (eftsl) course.eftsl = Number(eftsl[1]);
  const offerings = markdown
    .split(`### Offerings in ${year}\n`)[1]
    ?.split(/^### Offerings in /mu)[0];
  const date = (value: string): string | null => {
    const parts = value.match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/u);
    if (!parts) return null;
    const month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(parts[2]!);
    if (month < 0) return null;
    const iso = `${parts[3]}-${String(month + 1).padStart(2, "0")}-${parts[1]!.padStart(2, "0")}`;
    const parsed = new Date(iso);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === iso
      ? iso
      : null;
  };
  if (offerings) {
    for (const block of offerings.split(/^### /mu).slice(1)) {
      const name = block.split("\n")[0]!.trim();
      const semesterCode =
        name === "First Semester"
          ? "S1"
          : name === "Second Semester"
            ? "S2"
            : null;
      const period = context?.knownAcademicPeriods?.find(
        (item) =>
          item.name === name ||
          (semesterCode !== null && item.code === semesterCode),
      );
      if (!period) {
        review(
          "offerings",
          `The period '${name}' has no matching calendar identity.`,
        );
        continue;
      }
      for (const line of block.match(/^\| \d+ *\|.+$/gmu) ?? []) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((value) => value.trim());
        if (cells.length !== 7) {
          review("offerings", "The class table layout needs review.");
          continue;
        }
        const [classNumber, starts, enrol, census, ends, delivery, summary] =
          cells as [string, string, string, string, string, string, string];
        const row: CourseOfferingClass = {
          position: course.offerings.length + 1,
          calendarYear: year,
          periodCode: period.code,
          periodName: name,
          classNumber,
          startsOn: date(starts),
          endsOn: date(ends),
          lastEnrolmentDate: date(enrol),
          censusDate: date(census),
          deliveryMode: delivery === "N/A" ? null : delivery,
          location: null,
          classSummaryUrl: summary.match(/\[View\]\(([^)]+)\)/u)?.[1] ?? null,
          sourceText: line,
        };
        if (
          [
            row.startsOn,
            row.endsOn,
            row.lastEnrolmentDate,
            row.censusDate,
          ].some((value) => !value)
        )
          review("offerings", "A printed class date needs review.");
        course.offerings.push(row);
      }
    }
  }
  const offeringSection = section("Offerings, Dates and Class Summary Links");
  const absentOfferings =
    offeringSection &&
    (/There are no current offerings for this course\./u.test(
      offeringSection,
    ) ||
      (!offerings && /^### Offerings in \d{4}$/mu.test(offeringSection)));
  course.offeringStatus = course.offerings.length
    ? "offered"
    : absentOfferings
      ? "not_offered"
      : "unknown";
  if (absentOfferings) evidence("offerings", offeringSection);
  if (course.offeringStatus === "unknown")
    review(
      "offerings",
      "No selected-year class table was read. Availability remains unknown.",
    );
  for (const key of [
    "school",
    "college",
    "subjectName",
    "academicCareer",
    "convenerText",
    "deliverySummary",
    "description",
  ] as const)
    evidence(key, course[key]);
  for (const key of [
    "workloadText",
    "inherentRequirements",
    "prescribedTexts",
  ] as const) {
    evidence(key, course[key]);
    course[key] =
      courseDisplayText(course[key])?.replace(/^#{1,4} /gmu, "") ?? null;
  }
  evidence(
    "requisites.assumedKnowledgeText",
    course.requisites.assumedKnowledgeText,
  );
  for (const key of [
    "learningOutcomes",
    "assessmentItems",
    "fees",
    "offerings",
    "attributes",
  ] as const)
    for (const item of course[key])
      evidence(key, "sourceText" in item ? item.sourceText : item.text);
  course.overallConfidence = null;
  return course;
}
