import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import {
  ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  parseAcademicStructureExtraction,
  type AcademicStructureExtraction,
  type AcademicStructureExtractionEvidence,
  type AcademicStructureExtractionReviewItem,
  type AcademicStructureKind,
  type AcademicStructureRelationship,
  type AcademicStructureSection,
  type AcademicStructureSummaryField,
} from "./contract.ts";
import {
  ANU_STRUCTURE_ROUTE_BY_KIND,
  validateAnuAcademicStructurePage,
} from "./source.ts";

const ENTITY_PATH =
  /^\/(?:([12]\d{3})\/)?(course|program|major|minor|specialisation)\/([^/?#]+)\/?$/iu;

const ROUTE_KIND = {
  course: "course",
  program: "programme",
  major: "major",
  minor: "minor",
  specialisation: "specialisation",
} as const;

function cleanText(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalised = value
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalised || null;
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function fieldKey(value: string, fallback: string) {
  return slugify(value, fallback).replace(/-/g, "_");
}

function blockText($: CheerioAPI, nodes: AnyNode[]) {
  const wrapper = $("<div></div>");
  for (const node of nodes) wrapper.append($(node).clone());
  wrapper.find("br").replaceWith("\n");
  wrapper.find("p,li,tr,dt,dd,h3,h4").each((_, node) => {
    $(node).prepend("\n").append("\n");
  });
  const lines = wrapper
    .text()
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.join("\n") || null;
}

function sectionNodes($: CheerioAPI, heading: AnyNode) {
  const feeCallout = $(heading).is("#indicative-fees")
    ? $(heading)
    : $(heading).closest("#indicative-fees");
  if (feeCallout.length) {
    return feeCallout.find(".callout-box__content").contents().toArray();
  }
  return $(heading).nextUntil("h2").toArray();
}

function summaryFields($: CheerioAPI) {
  const summary = $(".degree-summary.hide-mobile").first().length
    ? $(".degree-summary.hide-mobile").first()
    : $(".degree-summary").first();
  const output: AcademicStructureSummaryField[] = [];

  summary.find("li.degree-summary__code").each((_, item) => {
    const label = cleanText(
      $(item).find(".degree-summary__code-heading").first().text(),
    )?.replace(/:$/, "");
    if (!label) return;
    const values = $(item)
      .find(".degree-summary__code-text")
      .toArray()
      .map((value) => cleanText($(value).text()))
      .filter((value): value is string => Boolean(value));
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 0) {
      const clone = $(item).clone();
      clone.find(".degree-summary__code-heading").remove();
      const value = cleanText(clone.text());
      if (value) uniqueValues.push(value);
    }
    if (uniqueValues.length === 0) return;
    output.push({
      position: output.length + 1,
      key: fieldKey(label, `field_${output.length + 1}`),
      label,
      values: uniqueValues,
      sourceText: `${label}: ${uniqueValues.join("; ")}`,
    });
  });

  summary.find(".degree-summary__requirements-units").each((_, item) => {
    const label =
      cleanText(
        $(item).find(".degree-summary__requirements-heading").first().text(),
      )?.replace(/:$/, "") ?? "Unit Value";
    const clone = $(item).clone();
    clone.find(".degree-summary__requirements-heading").remove();
    const value = cleanText(clone.text());
    if (!value) return;
    output.push({
      position: output.length + 1,
      key: fieldKey(label, `field_${output.length + 1}`),
      label,
      values: [value],
      sourceText: `${label}: ${value}`,
    });
  });

  return output
    .filter(
      (field, index, fields) =>
        fields.findIndex(
          (candidate) =>
            candidate.key === field.key &&
            candidate.values.join("\u0000") === field.values.join("\u0000"),
        ) === index,
    )
    .map((field, index) => ({ ...field, position: index + 1 }));
}

function extractSections($: CheerioAPI) {
  const sections: AcademicStructureSection[] = [];
  const headings = $(".tab-content h2, main h2").toArray();
  const seen = new Set<string>();
  for (const [index, heading] of headings.entries()) {
    const title = cleanText($(heading).text());
    if (!title) continue;
    const key = slugify($(heading).attr("id") || title, `section-${index + 1}`);
    if (seen.has(key)) continue;
    const body = blockText($, sectionNodes($, heading));
    if (!body) continue;
    seen.add(key);
    sections.push({
      position: sections.length + 1,
      key,
      heading: title,
      markdown: body,
      sourceText: body,
      sourceLocator: `#${$(heading).attr("id") || key}`,
    });
  }
  return sections;
}

function summaryValue(
  fields: AcademicStructureSummaryField[],
  ...keys: string[]
) {
  for (const key of keys) {
    const value = fields.find((field) => field.key === key)?.values[0];
    if (value) return value;
  }
  return null;
}

function labelledNumber(value: string | null, positive = false) {
  if (!value) return null;
  const match = /\b\d+(?:\.\d+)?\b/u.exec(value.replace(/,/g, ""));
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0 || (positive && number <= 0)) {
    return null;
  }
  return number;
}

function labelledBoolean(value: string | null) {
  const normalised = value?.trim().toLowerCase();
  if (normalised === "yes" || normalised === "true") return true;
  if (normalised === "no" || normalised === "false") return false;
  return null;
}

function visibleMetaDescription(value: string | null) {
  return value ? cleanText(load(value).root().text()) : null;
}

function catalogueTarget(value: string | undefined, sourceUrl: string) {
  if (!value || value.startsWith("#")) return null;
  try {
    const url = new URL(value, sourceUrl);
    if (
      url.protocol !== "https:" ||
      url.origin !== "https://programsandcourses.anu.edu.au" ||
      url.username ||
      url.password
    ) {
      return null;
    }
    const match = ENTITY_PATH.exec(url.pathname);
    if (!match) return null;
    return {
      targetKind: ROUTE_KIND[match[2].toLowerCase() as keyof typeof ROUTE_KIND],
      targetCode: match[3].toUpperCase(),
    };
  } catch {
    return null;
  }
}

function relationshipKindForSection(key: string) {
  if (/^relevant-(?:degrees|programmes)$/.test(key)) return "relevant";
  if (
    /^(?:majors|minor|minor-options|minors|specialisations|study-options)$/.test(
      key,
    )
  ) {
    return "option";
  }
  return "source_reference";
}

function relationships(
  $: CheerioAPI,
  sections: AcademicStructureSection[],
  sourceUrl: string,
  ownKind: AcademicStructureKind,
  ownCode: string,
) {
  const output: AcademicStructureRelationship[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const heading = $(section.sourceLocator).first();
    if (!heading.length) continue;
    const anchors = sectionNodes($, heading.get(0)!).flatMap((node) =>
      $(node).find("a[href]").addBack("a[href]").toArray(),
    );
    for (const anchor of anchors) {
      const target = catalogueTarget($(anchor).attr("href"), sourceUrl);
      if (!target) continue;
      if (target.targetKind === ownKind && target.targetCode === ownCode) {
        continue;
      }
      const key = `${section.key}:${target.targetKind}:${target.targetCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = cleanText($(anchor).text());
      output.push({
        position: output.length + 1,
        relationshipKind: relationshipKindForSection(section.key),
        targetKind: target.targetKind,
        targetCode: target.targetCode,
        targetTitle:
          label && label.toUpperCase() !== target.targetCode ? label : null,
        sourceText: label ?? target.targetCode,
        sourceLocator: section.sourceLocator,
      });
    }
  }
  return output;
}

function learningOutcomes($: CheerioAPI, sections: AcademicStructureSection[]) {
  const section = sections.find(({ key }) => key === "learning-outcomes");
  if (!section) return [];
  const heading = $(section.sourceLocator).first();
  const items = heading.length
    ? sectionNodes($, heading.get(0)!).flatMap((node) =>
        $(node).find("li").addBack("li").toArray(),
      )
    : [];
  const values = items
    .map((item) => cleanText($(item).text()))
    .filter((value): value is string => Boolean(value));
  const fallback = values.length > 0 ? values : section.sourceText.split("\n");
  return [...new Set(fallback)]
    .map((text) => cleanText(text))
    .filter((text): text is string => Boolean(text))
    .map((text, index) => ({
      position: index + 1,
      text,
      sourceText: text,
      sourceLocator: section.sourceLocator,
    }));
}

function fees($: CheerioAPI) {
  const output: AcademicStructureExtraction["fees"] = [];
  for (const [selector, audience] of [
    ["#indicative-fees__domestic", "domestic"],
    ["#indicative-fees__international", "international"],
  ] as const) {
    const root = $(selector).first();
    const element = root.get(0);
    if (!element) continue;
    const sourceText = blockText($, [element]);
    if (!sourceText) continue;
    const sourceLabel =
      cleanText(root.find("dt").first().text()) ??
      (audience === "domestic" ? "Domestic" : "International");
    const amountText = /(?:AUD\s*|A\$\s*|\$\s*)([\d,]+(?:\.\d{1,2})?)/i.exec(
      sourceText,
    );
    const amount = amountText ? Number(amountText[1].replace(/,/g, "")) : null;
    const printedYear = Number(/\b(20\d{2})\b/.exec(sourceText)?.[1]);
    const feeYear = Number.isInteger(printedYear) ? printedYear : null;
    const currency = /(?:\bAUD\b|A\$)/i.test(sourceText) ? "AUD" : null;

    if (/Commonwealth Supported Place|\bCSP\b/i.test(sourceText)) {
      output.push({
        position: output.length + 1,
        feeYear,
        audience: "commonwealth_supported",
        feeType: "student_contribution",
        amount: null,
        currency: null,
        basis: "programme",
        sourceLabel: "Commonwealth Supported Place (CSP)",
        sourceText,
        sourceLocator: selector,
      });
    }

    if (amount !== null) {
      const annual = /annual indicative fee/i.test(sourceText);
      output.push({
        position: output.length + 1,
        feeYear,
        audience,
        feeType: annual ? "indicative" : "other",
        amount,
        currency,
        basis: annual ? "annual" : "unknown",
        sourceLabel,
        sourceText,
        sourceLocator: selector,
      });
    }
  }
  return output;
}

function excerpt(value: string, maximum = 500) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 3)}...`;
}

export function extractDeterministicAcademicStructure({
  html,
  kind,
  code,
  year,
  sourceUrl,
}: {
  html: string;
  kind: AcademicStructureKind;
  code: string;
  year: number;
  sourceUrl: string;
}): AcademicStructureExtraction {
  const validation = validateAnuAcademicStructurePage({
    html,
    expectedKind: kind,
    expectedCode: code,
    expectedYear: year,
    requestedUrl: sourceUrl,
  });
  if (!validation.valid) {
    throw new TypeError(
      `Cannot extract an invalid ANU academic structure page: ${validation.issues
        .map(({ message }) => message)
        .join(" ")}`,
    );
  }

  const $ = load(html);
  const metadataPrefix = ANU_STRUCTURE_ROUTE_BY_KIND[kind];
  const metadata = (name: string) =>
    cleanText($(`meta[name="${metadataPrefix}-${name}"]`).attr("content"));
  const fields = summaryFields($);
  const sections = extractSections($);
  const labelledSource = (metadataName: string, ...keys: string[]) => {
    const field = fields.find((candidate) => keys.includes(candidate.key));
    if (field) {
      return {
        value: field.values[0]!,
        sourceText: field.sourceText,
        sourceLocator: ".degree-summary",
      };
    }
    const value = metadata(metadataName);
    return value
      ? {
          value,
          sourceText: value,
          sourceLocator: `meta[name="${metadataPrefix}-${metadataName}"]`,
        }
      : null;
  };
  const introduction = cleanText($("#introduction").first().text());
  const descriptionSource = metadata("description");
  const parsedDescription = visibleMetaDescription(descriptionSource);
  const description =
    introduction &&
    parsedDescription?.localeCompare(introduction, undefined, {
      sensitivity: "accent",
    }) === 0
      ? null
      : parsedDescription;
  const shortNameSource = labelledSource("short-name", "short_name");
  const shortName = shortNameSource?.value ?? null;
  const durationSource = labelledSource(
    "duration",
    "duration",
    "programme_duration",
    "program_duration",
  );
  const durationYears = labelledNumber(durationSource?.value ?? null, true);
  const collegeSource = labelledSource(
    "college",
    "college",
    "academic_college",
    "responsible_college",
  );
  const college = collegeSource?.value ?? null;
  const selectionRankSource = labelledSource(
    "selection-rank",
    "selection_rank",
  );
  const selectionRank = labelledNumber(selectionRankSource?.value ?? null);
  const atarSource = labelledSource(
    "atar",
    "atar",
    "minimum_atar",
    "guaranteed_atar",
  );
  const atar = labelledNumber(atarSource?.value ?? null);
  const canCombineSource = labelledSource("can-combine", "can_combine");
  const canCombine = labelledBoolean(canCombineSource?.value ?? null);
  const canCombineVerticalSource = labelledSource(
    "can-combine-vertical",
    "can_combine_vertical",
    "can_combine_vertically",
    "vertical_combination",
  );
  const canCombineVertical = labelledBoolean(
    canCombineVerticalSource?.value ?? null,
  );
  const studyAsSource = labelledSource("study-as", "study_as", "available_as");
  const studyAs = studyAsSource?.value ?? null;
  const unitText = summaryValue(
    fields,
    "unit_value",
    "total_units",
    "minimum",
    "units",
  );
  const unitMatch = /\b(\d+(?:\.\d+)?)\s*units?\b/i.exec(unitText ?? "");
  const totalUnits = unitMatch ? Number(unitMatch[1]) : null;
  const requirementSection = sections.find(({ key }) =>
    kind === "programme"
      ? key === "program-requirements"
      : key === "requirements",
  );
  const extractedFees = fees($);
  const scalarEvidence = (
    fieldKey: string,
    value: string | number | boolean | null,
    source: { sourceLocator: string; sourceText: string; value: string } | null,
  ): AcademicStructureExtractionEvidence[] =>
    value === null || !source
      ? []
      : [
          {
            fieldKey,
            sourceLocator: source.sourceLocator,
            evidenceExcerpt: excerpt(source.sourceText),
            confidence: 0.99,
            method: "deterministic",
          },
        ];
  const evidence: AcademicStructureExtractionEvidence[] = [
    {
      fieldKey: "kind",
      sourceLocator: `meta[name="${metadataPrefix}-code"]`,
      evidenceExcerpt: metadataPrefix,
      confidence: 1,
      method: "deterministic",
    },
    {
      fieldKey: "code",
      sourceLocator: `meta[name="${metadataPrefix}-code"]`,
      evidenceExcerpt: validation.page.code,
      confidence: 1,
      method: "deterministic",
    },
    {
      fieldKey: "year",
      sourceLocator: `meta[name="${metadataPrefix}-year"]`,
      evidenceExcerpt: String(validation.page.year),
      confidence: 1,
      method: "deterministic",
    },
    {
      fieldKey: "title",
      sourceLocator: `meta[name="${metadataPrefix}-name"]`,
      evidenceExcerpt: validation.page.title,
      confidence: 1,
      method: "deterministic",
    },
    ...scalarEvidence("shortName", shortName, shortNameSource),
    ...(introduction
      ? [
          {
            fieldKey: "introduction",
            sourceLocator: "#introduction",
            evidenceExcerpt: excerpt(introduction),
            confidence: 0.99,
            method: "deterministic" as const,
          },
        ]
      : []),
    ...scalarEvidence(
      "description",
      description,
      descriptionSource
        ? {
            value: descriptionSource,
            sourceText: descriptionSource,
            sourceLocator: `meta[name="${metadataPrefix}-description"]`,
          }
        : null,
    ),
    ...scalarEvidence("durationYears", durationYears, durationSource),
    ...scalarEvidence("college", college, collegeSource),
    ...scalarEvidence("selectionRank", selectionRank, selectionRankSource),
    ...scalarEvidence("atar", atar, atarSource),
    ...scalarEvidence("canCombine", canCombine, canCombineSource),
    ...scalarEvidence(
      "canCombineVertical",
      canCombineVertical,
      canCombineVerticalSource,
    ),
    ...scalarEvidence("studyAs", studyAs, studyAsSource),
    ...fields.map((field) => ({
      fieldKey: `summaryFields.${field.key}`,
      sourceLocator: ".degree-summary",
      evidenceExcerpt: excerpt(field.sourceText),
      confidence: 0.99,
      method: "deterministic" as const,
    })),
    ...sections.map((section) => ({
      fieldKey: `sections.${section.key}`,
      sourceLocator: section.sourceLocator,
      evidenceExcerpt: excerpt(section.sourceText),
      confidence: 0.99,
      method: "deterministic" as const,
    })),
    ...extractedFees.map((fee, index) => ({
      fieldKey: `fees.${index}`,
      sourceLocator: fee.sourceLocator,
      evidenceExcerpt: excerpt(fee.sourceText),
      confidence: 0.99,
      method: "deterministic" as const,
    })),
  ];
  const reviewItems: AcademicStructureExtractionReviewItem[] = [];
  if (requirementSection) {
    reviewItems.push({
      fieldKey: "requirements.rule",
      kind: "unsupported",
      severity: "warning",
      message:
        "The deterministic parser preserved the complete requirement prose for model interpretation and administrator review.",
    });
  } else {
    reviewItems.push({
      fieldKey: "requirements",
      kind: "missing",
      severity: "warning",
      message: "No requirements section was found on the source page.",
    });
  }

  const extraction: AcademicStructureExtraction = {
    schemaVersion: ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
    kind,
    code: validation.page.code,
    year: validation.page.year,
    title: validation.page.title,
    acronym: metadata("acronym"),
    shortName,
    introduction,
    description,
    totalUnits,
    durationYears,
    academicCareer: summaryValue(fields, "academic_career"),
    college,
    deliveryMode: summaryValue(fields, "mode_of_delivery", "delivery_mode"),
    selectionRank,
    atar,
    canCombine,
    canCombineVertical,
    studyAs,
    contactText: summaryValue(
      fields,
      "academic_contact",
      "programme_contact",
      "program_contact",
    ),
    summaryFields: fields,
    sections,
    learningOutcomes: learningOutcomes($, sections),
    fees: extractedFees,
    relationships: relationships(
      $,
      sections,
      sourceUrl,
      kind,
      validation.page.code,
    ),
    requirements: requirementSection
      ? {
          sourceText: requirementSection.sourceText,
          sourceLocator: requirementSection.sourceLocator,
          rule: {
            type: "group",
            key: "requirements:root",
            operator: "all_of",
            minimumCount: null,
            title: requirementSection.heading,
            sourceText: requirementSection.sourceText,
            sourceLocator: requirementSection.sourceLocator,
            children: [
              {
                type: "condition",
                key: "requirements:source-text",
                conditionKind: "free_text",
                minimumUnits: null,
                maximumUnits: null,
                minimumCourses: null,
                courseCodes: [],
                structureKind: null,
                structureCodes: [],
                subjectCode: null,
                minimumLevel: null,
                maximumLevel: null,
                tag: null,
                freeText: requirementSection.sourceText,
                sourceText: requirementSection.sourceText,
                sourceLocator: requirementSection.sourceLocator,
              },
            ],
          },
          unmodelledText: [requirementSection.sourceText],
        }
      : {
          sourceText: null,
          sourceLocator: null,
          rule: null,
          unmodelledText: [],
        },
    evidence,
    overallConfidence: null,
    reviewItems,
  };

  return parseAcademicStructureExtraction(extraction, {
    expectedKind: kind,
    expectedCode: code,
    expectedYear: year,
    evidenceMethod: "deterministic",
  });
}
