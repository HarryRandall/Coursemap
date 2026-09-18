import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { normaliseAnuClassSummaryUrl } from "./contract.ts";
import {
  ANU_PROGRAMS_AND_COURSES_ORIGIN,
  validateAnuCoursePage,
} from "./source.ts";

export const COURSE_MARKDOWN_VERSION = "anu-course-markdown.v2" as const;

export type CourseMarkdownSection = {
  heading: string;
  body: string;
  sourceLocator: string;
};

export type CourseMarkdownResult = {
  version: typeof COURSE_MARKDOWN_VERSION;
  markdown: string;
  sections: CourseMarkdownSection[];
  statistics: {
    inputCharacters: number;
    outputCharacters: number;
    reductionPercent: number;
    keyFactCount: number;
    sectionCount: number;
  };
};

export type CourseModelInputResult = {
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
  /^\/(?:\d{4}\/)?(?:course|program|major|minor|specialisation)\/([A-Za-z0-9-]+)\/?$/iu;
type MarkdownLinkContext = {
  sourceUrl: string;
  expectedCourseCode: string;
};

function officialLink(value: string | undefined, context: MarkdownLinkContext) {
  if (!value || value.startsWith("#")) return null;
  try {
    const url = new URL(value, context.sourceUrl);
    if (
      url.protocol !== "https:" ||
      url.origin !== ANU_PROGRAMS_AND_COURSES_ORIGIN ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function officialClassSummaryUrl(
  value: string | undefined,
  context: MarkdownLinkContext,
) {
  return normaliseAnuClassSummaryUrl(value, {
    baseUrl: context.sourceUrl,
    expectedCourseCode: context.expectedCourseCode,
  });
}

function officialEntityCode(
  value: string | undefined,
  context: MarkdownLinkContext,
) {
  const url = officialLink(value, context);
  const match = url ? ENTITY_PATH.exec(url.pathname) : null;
  return match?.[1].toUpperCase() ?? null;
}

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

function escapeTableCell(value: string) {
  return cleanText(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderTable(
  $: CheerioAPI,
  node: AnyNode,
  context: MarkdownLinkContext,
) {
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
              .map((child) => nodeToMarkdown($, child, context))
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
  context: MarkdownLinkContext,
): string {
  if (node.type === "text") return cleanInline(node.data ?? "");
  if (node.type !== "tag") return "";

  const element = $(node);
  const name = node.name.toLowerCase();
  const children = () =>
    element
      .contents()
      .toArray()
      .map((child) => nodeToMarkdown($, child, context))
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
    const classSummaryUrl = officialClassSummaryUrl(
      element.attr("href"),
      context,
    );
    if (classSummaryUrl) {
      return `[${text || "Class summary"}](${classSummaryUrl})`;
    }
    const code = officialEntityCode(element.attr("href"), context);
    if (!code) return text;
    return text && text.toUpperCase() !== code ? `[${text}](${code})` : code;
  }
  if (/^h[1-6]$/.test(name)) {
    const body = cleanText(element.text());
    const level = Math.min(Number(name.slice(1)), 4);
    return body ? `\n\n${"#".repeat(level)} ${body}\n\n` : "";
  }
  if (name === "li") {
    const body = cleanText(children());
    return body ? `\n- ${body}` : "";
  }
  if (name === "ul" || name === "ol") return `${children()}\n`;
  if (name === "table") return `\n\n${renderTable($, node, context)}\n\n`;
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

function metadata($: CheerioAPI, name: string) {
  const value = $(`meta[name="${name}"]`).first().attr("content");
  return value ? cleanText(value) : null;
}

function yamlValue(value: string) {
  return JSON.stringify(value);
}

function keyFacts($: CheerioAPI) {
  const facts: string[] = [];
  const add = (value: string | null) => {
    if (value && !facts.includes(value)) facts.push(value);
  };

  const summary = $(".degree-summary.hide-mobile").first().length
    ? $(".degree-summary.hide-mobile").first()
    : $(".degree-summary").first();
  summary.find(".degree-summary__requirements-units").each((_, item) => {
    add(cleanText($(item).text()));
  });
  summary.find(".degree-summary__code").each((_, item) => {
    const heading = cleanText(
      $(item).find(".degree-summary__code-heading").first().text(),
    );
    const values = $(item)
      .find(".degree-summary__code-text")
      .toArray()
      .map((value) => cleanText($(value).text()))
      .filter(Boolean);
    const value = [...new Set(values)].join("; ");
    add(
      heading && value
        ? `${heading}: ${value}`
        : heading && /^(?:STEM Course)$/i.test(heading)
          ? heading
          : null,
    );
  });

  // Some page generations use a plain definition list instead of the
  // degree-summary classes. Keep recognised pairs without suppressing new
  // body sections.
  summary.find("dt").each((_, item) => {
    const heading = cleanText($(item).text()).replace(/:$/, "");
    const value = cleanText($(item).next("dd").first().text());
    add(heading && value ? `${heading}: ${value}` : null);
  });
  return facts;
}

function sectionBody(
  $: CheerioAPI,
  heading: AnyNode,
  context: MarkdownLinkContext,
) {
  const parts: string[] = [];
  let sibling = $(heading).next();
  while (sibling.length && sibling.get(0)?.type === "tag") {
    if (sibling.is("h2")) break;
    if (
      sibling.is(".course-tabs-menu") ||
      sibling.find(".course-tabs-menu").length > 0 ||
      /^course-tab-/i.test(sibling.attr("id") ?? "") ||
      sibling.find("[id^='course-tab-']").length > 0
    ) {
      break;
    }
    parts.push(nodeToMarkdown($, sibling.get(0) as AnyNode, context));
    sibling = sibling.next();
  }
  return cleanMarkdown(parts.join(""));
}

function depthWithin($: CheerioAPI, node: AnyNode, root: AnyNode) {
  let depth = 0;
  let parent = $(node).parent();
  while (parent.length && parent.get(0) !== root) {
    depth += 1;
    parent = parent.parent();
  }
  return depth;
}

function isPrimarySectionHeading($: CheerioAPI, heading: AnyNode) {
  const root = $(heading).closest(".body__inner").first();
  if (!root.length) return true;
  const rootNode = root.get(0) as AnyNode;
  const depths = root
    .find("h2")
    .toArray()
    .map((candidate) => depthWithin($, candidate, rootNode));
  return depthWithin($, heading, rootNode) === Math.min(...depths);
}

function extractSections($: CheerioAPI, context: MarkdownLinkContext) {
  const sections: CourseMarkdownSection[] = [];
  const seen = new Set<string>();
  const add = (section: CourseMarkdownSection) => {
    const body = cleanMarkdown(section.body);
    if (!body) return;
    const key = `${section.heading.toLowerCase()}\u0000${body}`;
    if (seen.has(key)) return;
    seen.add(key);
    sections.push({ ...section, body });
  };

  $("h2").each((index, heading) => {
    const title = cleanText($(heading).text());
    if (
      !title ||
      /back to (?:the )?top/i.test(title) ||
      !isPrimarySectionHeading($, heading)
    )
      return;
    add({
      heading: title,
      body: sectionBody($, heading, context),
      sourceLocator: $(heading).attr("id")
        ? `#${$(heading).attr("id")}`
        : `h2[${index + 1}]`,
    });
  });

  if (!sections.some(({ heading }) => /introduction|overview/i.test(heading))) {
    const introduction = $("#introduction").first();
    if (introduction.length) {
      add({
        heading: "Introduction",
        body: nodeToMarkdown($, introduction.get(0) as AnyNode, context),
        sourceLocator: "#introduction",
      });
    }
  }

  const tabs = $(".course-tabs-menu").first();
  if (tabs.length) {
    const offeringParts: string[] = [];
    tabs.find("a[href^='#']").each((_, anchor) => {
      const tabYear = cleanText($(anchor).text());
      const target = $(anchor).attr("href");
      if (!/^20\d{2}$/.test(tabYear) || !target) return;
      const panel = $(target).first();
      if (!panel.length) return;
      offeringParts.push(`### ${tabYear}`);
      panel.children().each((__, child) => {
        offeringParts.push(nodeToMarkdown($, child as AnyNode, context));
      });
    });
    const offeringBody = cleanMarkdown(offeringParts.join("\n\n"));
    const existingIndex = sections.findIndex(({ heading }) =>
      /offerings?|dates and class/i.test(heading),
    );
    if (existingIndex >= 0 && offeringBody) {
      const existing = sections[existingIndex]!;
      sections[existingIndex] = {
        ...existing,
        body: cleanMarkdown(`${existing.body}\n\n${offeringBody}`),
        sourceLocator: `${existing.sourceLocator}, .course-tabs-menu`,
      };
    } else {
      add({
        heading: "Offerings, Dates and Class Summary Links",
        body: offeringBody,
        sourceLocator: ".course-tabs-menu",
      });
    }
  }
  return sections;
}

/**
 * Oscar's process is retained as separate inspectable artefacts: raw HTML is
 * converted deterministically to stable Markdown before a smaller model input
 * is selected. Unlike the planner-specific reference script, rich course
 * sections such as fees, outcomes, assessment and workload are deliberately
 * retained, and unrecognised sections are retained by default.
 */
export function convertCourseHtmlToMarkdown({
  html,
  courseCode,
  year,
  sourceUrl,
}: {
  html: string;
  courseCode: string;
  year: number;
  sourceUrl: string;
}): CourseMarkdownResult {
  const validation = validateAnuCoursePage({
    html,
    expectedCourseCode: courseCode,
    expectedYear: year,
    requestedUrl: sourceUrl,
  });
  if (!validation.valid) {
    throw new TypeError(
      `Cannot convert an invalid course page: ${validation.issues.map(({ message }) => message).join(" ")}`,
    );
  }

  const $ = load(html);
  CHROME_SELECTORS.forEach((selector) => $(selector).remove());
  const context = {
    sourceUrl: validation.page.canonicalUrl,
    expectedCourseCode: validation.page.code,
  };
  const facts = keyFacts($);
  const sections = extractSections($, context);
  const description = metadata($, "course-description");
  if (
    description &&
    !sections.some(({ heading }) =>
      /introduction|overview|description/i.test(heading),
    )
  ) {
    sections.unshift({
      heading: "Description",
      body: cleanText(load(description).root().text()),
      sourceLocator: 'meta[name="course-description"]',
    });
  }

  const lines = [
    "---",
    `schema-version: ${yamlValue(COURSE_MARKDOWN_VERSION)}`,
    'type: "course"',
    `code: ${yamlValue(validation.page.code)}`,
    `year: ${validation.page.year}`,
    `course-name: ${yamlValue(validation.page.title)}`,
    `source-url: ${yamlValue(validation.page.canonicalUrl)}`,
    "---",
    "",
  ];
  if (facts.length > 0) {
    lines.push("## Key facts", "", ...facts.map((fact) => `- ${fact}`), "");
  }
  for (const section of sections) {
    lines.push(`## ${section.heading}`, "", section.body, "");
  }
  const markdown = `${cleanMarkdown(lines.join("\n"))}\n`;

  return {
    version: COURSE_MARKDOWN_VERSION,
    markdown,
    sections,
    statistics: {
      inputCharacters: html.length,
      outputCharacters: markdown.length,
      reductionPercent: Number(
        (100 * (1 - markdown.length / Math.max(html.length, 1))).toFixed(1),
      ),
      keyFactCount: facts.length,
      sectionCount: sections.length,
    },
  };
}

function splitMarkdown(markdown: string) {
  const firstHeading = markdown.search(/^## /m);
  if (firstHeading < 0) return { frontMatter: markdown.trim(), sections: [] };
  const frontMatter = markdown.slice(0, firstHeading).trim();
  const body = markdown.slice(firstHeading);
  const matches = [...body.matchAll(/^## (.+)$/gm)];
  const sections = matches.map((match, index) => ({
    heading: match[1].trim(),
    body: body
      .slice(
        match.index! + match[0].length,
        matches[index + 1]?.index ?? body.length,
      )
      .trim(),
  }));
  return { frontMatter, sections };
}

function selectedOfferingYear(body: string, year: number) {
  const lines = body.split("\n");
  const output: string[] = [];
  let includeYearBlock = true;
  let sawYearHeading = false;
  for (const line of lines) {
    const heading = /^###\s+(20\d{2})\s*$/.exec(line.trim());
    if (heading) {
      sawYearHeading = true;
      includeYearBlock = Number(heading[1]) === year;
      if (includeYearBlock) output.push(line);
      continue;
    }
    if (!includeYearBlock) continue;

    // A few ANU generations put every year in one table rather than year tabs.
    // Retain headers and selected-year rows, and discard rows that clearly
    // identify a different calendar year.
    if (line.trim().startsWith("|")) {
      const years = [...line.matchAll(/\b(20\d{2})\b/g)].map((match) =>
        Number(match[1]),
      );
      if (
        years.length > 0 &&
        !years.includes(year) &&
        !/^\|?\s*[-:| ]+\|?$/.test(line)
      ) {
        continue;
      }
    }
    output.push(line);
  }
  return sawYearHeading
    ? cleanMarkdown(output.join("\n"))
    : cleanMarkdown(output.join("\n"));
}

const MODEL_SECTION_PRIORITY = [
  /key facts/i,
  /requisite|incompatib/i,
  /introduction|overview|description/i,
  /learning outcomes?/i,
  /assessment/i,
  /workload/i,
  /fees?/i,
  /offerings?|dates and class/i,
  /inherent requirements?/i,
  /prescribed texts?/i,
];

export function buildCourseModelInput(
  markdown: string,
  year: number,
  { maxCharacters = 48_000 }: { maxCharacters?: number } = {},
): CourseModelInputResult {
  if (!Number.isInteger(year)) throw new TypeError("year must be an integer");
  if (!Number.isInteger(maxCharacters) || maxCharacters < 2_000) {
    throw new TypeError("maxCharacters must be an integer of at least 2000");
  }
  const parsed = splitMarkdown(markdown);
  const sections = parsed.sections.map((section, sourceIndex) => ({
    ...section,
    sourceIndex,
    body: /offerings?|dates and class/i.test(section.heading)
      ? selectedOfferingYear(section.body, year)
      : cleanMarkdown(section.body),
  }));
  const ordered = [...sections].sort((left, right) => {
    const priority = (heading: string) => {
      const index = MODEL_SECTION_PRIORITY.findIndex((pattern) =>
        pattern.test(heading),
      );
      return index < 0 ? MODEL_SECTION_PRIORITY.length : index;
    };
    return (
      priority(left.heading) - priority(right.heading) ||
      left.sourceIndex - right.sourceIndex
    );
  });

  const chunks = [parsed.frontMatter];
  const includedSections: string[] = [];
  const omittedSections: string[] = [];
  for (const section of ordered) {
    if (!section.body) {
      omittedSections.push(section.heading);
      continue;
    }
    const chunk = `## ${section.heading}\n\n${section.body}`;
    const candidate = `${chunks.join("\n\n")}\n\n${chunk}`;
    if (candidate.length > maxCharacters) {
      omittedSections.push(section.heading);
      continue;
    }
    chunks.push(chunk);
    includedSections.push(section.heading);
  }
  return {
    modelInput: `${cleanMarkdown(chunks.join("\n\n"))}\n`,
    includedSections,
    omittedSections,
  };
}
