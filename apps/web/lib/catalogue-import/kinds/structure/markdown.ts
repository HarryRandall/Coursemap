import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { AcademicStructureKind } from "./contract.ts";
import {
  ANU_STRUCTURE_ROUTE_BY_KIND,
  validateAnuAcademicStructurePage,
} from "./source.ts";

export const ACADEMIC_STRUCTURE_MARKDOWN_VERSION =
  "anu-academic-structure-markdown.v1" as const;

export type AcademicStructureMarkdownSection = {
  key: string;
  heading: string;
  body: string;
  sourceLocator: string;
};

export type AcademicStructureMarkdownResult = {
  version: typeof ACADEMIC_STRUCTURE_MARKDOWN_VERSION;
  kind: AcademicStructureKind;
  code: string;
  year: number;
  title: string;
  sourceUrl: string;
  frontMatter: string;
  summaryMarkdown: string;
  introductionMarkdown: string | null;
  sections: AcademicStructureMarkdownSection[];
  markdown: string;
  statistics: {
    inputCharacters: number;
    outputCharacters: number;
    reductionPercent: number;
    summaryFieldCount: number;
    sectionCount: number;
  };
};

export type AcademicStructureModelInputResult = {
  modelInput: string;
  includedSections: string[];
  omittedSections: string[];
};

const CHROME_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "img",
  "picture",
  "nav",
  "header",
  "footer",
  "form",
  "button",
  "input",
  "select",
  ".breadcrumb",
  ".breadcrumbs",
  ".cookie-banner",
  ".social-share",
  ".back-to-top",
  ".modal",
];

const ENTITY_PATH =
  /^\/(?:\d{4}\/)?(course|program|major|minor|specialisation)\/([A-Za-z0-9-]+)\/?$/iu;

const ROUTE_LABEL = {
  course: "course",
  program: "programme",
  major: "major",
  minor: "minor",
  specialisation: "specialisation",
} as const;

function cleanInline(value: string) {
  return value
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function cleanText(value: string) {
  return cleanInline(value).trim();
}

function cleanMarkdown(value: string) {
  return value
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function officialEntity(value: string | undefined, sourceUrl: string) {
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
      kind: ROUTE_LABEL[match[1].toLowerCase() as keyof typeof ROUTE_LABEL],
      code: match[2].toUpperCase(),
    };
  } catch {
    return null;
  }
}

function escapeTableCell(value: string) {
  return cleanText(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderTable($: CheerioAPI, node: AnyNode, sourceUrl: string) {
  const rows: string[][] = [];
  $(node)
    .find("tr")
    .each((_, row) => {
      const values = $(row)
        .find("th,td")
        .toArray()
        .map((cell) =>
          escapeTableCell(
            $(cell)
              .contents()
              .toArray()
              .map((child) => nodeToMarkdown($, child, sourceUrl))
              .join(""),
          ),
        );
      if (values.some(Boolean)) rows.push(values);
    });
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [
    ...row,
    ...Array.from({ length: width - row.length }, () => ""),
  ]);
  return [
    `| ${padded[0].join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function nodeToMarkdown(
  $: CheerioAPI,
  node: AnyNode,
  sourceUrl: string,
): string {
  if (node.type === "text") return cleanInline(node.data ?? "");
  if (node.type !== "tag") return "";
  const element = $(node);
  const name = node.name.toLowerCase();
  const children = () =>
    element
      .contents()
      .toArray()
      .map((child) => nodeToMarkdown($, child, sourceUrl))
      .join("");

  if (name === "br") return "\n";
  if (name === "strong" || name === "b") {
    const body = cleanText(children());
    return body ? `**${body}**` : "";
  }
  if (name === "em" || name === "i") {
    const body = cleanText(children());
    return body ? `*${body}*` : "";
  }
  if (name === "a") {
    const text = cleanText(children());
    const entity = officialEntity(element.attr("href"), sourceUrl);
    if (!entity) return text;
    return `[${text || entity.code}](${entity.kind}:${entity.code})`;
  }
  if (name === "li") {
    const body = cleanMarkdown(children());
    return body ? `\n- ${body}` : "";
  }
  if (name === "ul" || name === "ol") return `${children()}\n`;
  if (name === "table") return `\n\n${renderTable($, node, sourceUrl)}\n\n`;
  if (name === "dt") {
    const body = cleanText(children());
    return body ? `\n- **${body.replace(/:$/, "")}:** ` : "";
  }
  if (name === "dd") return `${cleanText(children())}\n`;
  if (["p", "div", "section", "article", "tr"].includes(name)) {
    const body = cleanMarkdown(children());
    return body ? `\n\n${body}\n\n` : "";
  }
  return children();
}

function elementMarkdown($: CheerioAPI, nodes: AnyNode[], sourceUrl: string) {
  return cleanMarkdown(
    nodes.map((node) => nodeToMarkdown($, node, sourceUrl)).join(""),
  );
}

function summaryMarkdown($: CheerioAPI, sourceUrl: string) {
  const summary = $(".degree-summary.hide-mobile").first().length
    ? $(".degree-summary.hide-mobile").first()
    : $(".degree-summary").first();
  const rows: Array<{ label: string; value: string }> = [];
  summary.find("li.degree-summary__code").each((_, item) => {
    const label = cleanText(
      $(item).find(".degree-summary__code-heading").first().text(),
    ).replace(/:$/, "");
    const values = $(item)
      .find(".degree-summary__code-text")
      .toArray()
      .map((value) =>
        elementMarkdown($, $(value).contents().toArray(), sourceUrl),
      )
      .filter(Boolean);
    const unique = [...new Set(values)];
    if (label && unique.length > 0) {
      rows.push({ label, value: unique.join("; ") });
    }
  });
  summary.find(".degree-summary__requirements-units").each((_, item) => {
    const label =
      cleanText(
        $(item).find(".degree-summary__requirements-heading").first().text(),
      ).replace(/:$/, "") || "Unit value";
    const clone = $(item).clone();
    clone.find(".degree-summary__requirements-heading").remove();
    const value = cleanText(clone.text());
    if (value) rows.push({ label, value });
  });
  const deduplicated = rows.filter(
    (row, index) =>
      rows.findIndex(
        (candidate) =>
          candidate.label === row.label && candidate.value === row.value,
      ) === index,
  );
  return {
    count: deduplicated.length,
    markdown:
      deduplicated.length > 0
        ? [
            "## Summary",
            ...deduplicated.map(
              ({ label, value }) => `- **${label}:** ${value}`,
            ),
          ].join("\n")
        : "",
  };
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

function yamlString(value: string) {
  return JSON.stringify(value);
}

export function convertAcademicStructureHtmlToMarkdown({
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
}): AcademicStructureMarkdownResult {
  const validation = validateAnuAcademicStructurePage({
    html,
    expectedKind: kind,
    expectedCode: code,
    expectedYear: year,
    requestedUrl: sourceUrl,
  });
  if (!validation.valid) {
    throw new TypeError(
      `Cannot convert an invalid ANU academic structure page: ${validation.issues
        .map(({ message }) => message)
        .join(" ")}`,
    );
  }

  const $ = load(html);
  $(CHROME_SELECTORS.join(",")).remove();
  const prefix = ANU_STRUCTURE_ROUTE_BY_KIND[kind];
  const acronym = cleanText(
    $(`meta[name="${prefix}-acronym"]`).first().attr("content") ?? "",
  );
  const frontMatter = [
    "---",
    `kind: ${kind}`,
    `code: ${validation.page.code}`,
    `year: ${validation.page.year}`,
    `title: ${yamlString(validation.page.title)}`,
    `acronym: ${acronym ? yamlString(acronym) : "null"}`,
    `source_url: ${yamlString(sourceUrl)}`,
    "---",
  ].join("\n");

  const summary = summaryMarkdown($, sourceUrl);
  const introductionRoot = $("#introduction").first();
  const introductionBody = introductionRoot.length
    ? elementMarkdown($, introductionRoot.contents().toArray(), sourceUrl)
    : "";
  const introductionMarkdown = introductionBody
    ? `## Introduction\n\n${introductionBody}`
    : null;

  const sections: AcademicStructureMarkdownSection[] = [];
  const seenKeys = new Set<string>();
  $(".tab-content h2, main h2")
    .toArray()
    .forEach((heading, index) => {
      const title = cleanText($(heading).text());
      if (!title) return;
      const key = slugify(
        $(heading).attr("id") || title,
        `section-${index + 1}`,
      );
      if (seenKeys.has(key)) return;
      const body = elementMarkdown($, sectionNodes($, heading), sourceUrl);
      if (!body) return;
      seenKeys.add(key);
      sections.push({
        key,
        heading: title,
        body,
        sourceLocator: `#${$(heading).attr("id") || key}`,
      });
    });

  const parts = [
    frontMatter,
    summary.markdown,
    introductionMarkdown,
    ...sections.map(({ heading, body }) => `## ${heading}\n\n${body}`),
  ].filter((part): part is string => Boolean(part));
  const markdown = cleanMarkdown(parts.join("\n\n"));
  const reductionPercent =
    html.length === 0
      ? 0
      : Math.max(0, Math.round((1 - markdown.length / html.length) * 100));

  return {
    version: ACADEMIC_STRUCTURE_MARKDOWN_VERSION,
    kind,
    code: validation.page.code,
    year: validation.page.year,
    title: validation.page.title,
    sourceUrl,
    frontMatter,
    summaryMarkdown: summary.markdown,
    introductionMarkdown,
    sections,
    markdown,
    statistics: {
      inputCharacters: html.length,
      outputCharacters: markdown.length,
      reductionPercent,
      summaryFieldCount: summary.count,
      sectionCount: sections.length,
    },
  };
}

const PRIORITY_SECTION_KEYS = [
  "program-requirements",
  "requirements",
  "learning-outcomes",
  "admission-requirements",
  "prerequisites",
  "majors",
  "minors",
  "specialisations",
  "relevant-degrees",
  "other-information",
];

export function buildAcademicStructureModelInput(
  result: AcademicStructureMarkdownResult,
  { maxCharacters = 60_000 }: { maxCharacters?: number } = {},
): AcademicStructureModelInputResult {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 4_000) {
    throw new TypeError("maxCharacters must be an integer of at least 4000");
  }

  const baseParts = [
    result.frontMatter,
    result.summaryMarkdown,
    result.introductionMarkdown,
  ].filter((part): part is string => Boolean(part));
  const priority = [...result.sections].sort((left, right) => {
    const leftIndex = PRIORITY_SECTION_KEYS.indexOf(left.key);
    const rightIndex = PRIORITY_SECTION_KEYS.indexOf(right.key);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
  const included: AcademicStructureMarkdownSection[] = [];
  const omitted: AcademicStructureMarkdownSection[] = [];
  let length = cleanMarkdown(baseParts.join("\n\n")).length;

  for (const section of priority) {
    const markdown = `## ${section.heading}\n\n${section.body}`;
    const required = ["program-requirements", "requirements"].includes(
      section.key,
    );
    if (required || length + markdown.length + 2 <= maxCharacters) {
      included.push(section);
      length += markdown.length + 2;
    } else {
      omitted.push(section);
    }
  }

  const modelInput = cleanMarkdown(
    [
      ...baseParts,
      ...included.map(({ heading, body }) => `## ${heading}\n\n${body}`),
    ].join("\n\n"),
  );
  return {
    modelInput,
    includedSections: included.map(({ heading }) => heading),
    omittedSections: omitted.map(({ heading }) => heading),
  };
}
