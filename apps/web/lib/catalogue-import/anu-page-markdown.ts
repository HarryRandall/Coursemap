import { type CheerioAPI, load } from "cheerio";
import type { AnyNode } from "domhandler";
import { ANU_PROGRAMS_AND_COURSES_SOURCE } from "./import-source.ts";

export const ANU_PAGE_MARKDOWN_VERSION = "anu-page-markdown.v1" as const;

const ANU_ORIGIN = ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl;

/**
 * Page furniture that carries no catalogue content. The key facts are printed
 * twice, once for each viewport; the mobile copy is dropped so the model does
 * not read every fact as stated twice. The year switcher lists other years,
 * which would only invite the model to attribute facts to them.
 */
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
  ".show-mobile",
  ".course-tabs-menu",
  ".intro-tabs",
  ".intro__apply-to-study__current-academic-year",
  ".apply-to-study-button",
  ".enquire-now-button",
];

const ENTITY_PATH =
  /^\/(?:\d{4}\/)?(?:course|program|major|minor|specialisation)\/([A-Za-z0-9-]+)\/?$/iu;

/** Elements that only style text in place; everything else is its own run. */
const INLINE_ELEMENTS = new Set([
  "a",
  "abbr",
  "b",
  "code",
  "em",
  "i",
  "small",
  "strong",
  "sub",
  "sup",
  "u",
]);

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
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A link to another ANU record becomes its code, so the model reads "Bachelor
 * of Arts" as BARTS rather than guessing the code from the name. Other links
 * keep their target because contact addresses and class summaries live there.
 */
function linkMarkdown(text: string, href: string | undefined) {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
    return text;
  }
  let url: URL;
  try {
    url = new URL(href, ANU_ORIGIN);
  } catch {
    return text;
  }
  if (url.protocol === "mailto:") {
    const address = url.pathname;
    return text && text !== address ? `${text} (${address})` : address;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return text;
  if (url.origin === ANU_ORIGIN) {
    const code = ENTITY_PATH.exec(url.pathname)?.[1].toUpperCase();
    if (code) {
      return text && text.toUpperCase() !== code ? `[${text}](${code})` : code;
    }
  }
  return text ? `[${text}](${url.toString()})` : url.toString();
}

function renderTable($: CheerioAPI, node: AnyNode) {
  const rows: string[][] = [];
  $(node)
    .find("tr")
    .each((_, row) => {
      const cells = $(row)
        .find("th,td")
        .toArray()
        .map((cell) =>
          cleanText(childrenMarkdown($, cell))
            .replace(/\|/g, "\\|")
            .replace(/\n/g, " "),
        );
      if (cells.some(Boolean)) rows.push(cells);
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

function childrenMarkdown($: CheerioAPI, node: AnyNode): string {
  // Adjacent elements such as a key-fact label and its value are separate
  // runs even when the page puts no whitespace between them.
  return $(node)
    .contents()
    .toArray()
    .map((child) => {
      const text = nodeMarkdown($, child);
      return child.type === "tag" &&
        !INLINE_ELEMENTS.has(child.name.toLowerCase())
        ? ` ${text} `
        : text;
    })
    .join("");
}

function nodeMarkdown($: CheerioAPI, node: AnyNode): string {
  if (node.type === "text") return cleanInline(node.data ?? "");
  if (node.type !== "tag") return "";
  const element = $(node);
  const name = node.name.toLowerCase();

  if (name === "br") return "\n";
  if (name === "strong" || name === "b") {
    const body = cleanText(childrenMarkdown($, node));
    return body ? `**${body}**` : "";
  }
  if (name === "em" || name === "i") {
    const body = cleanText(childrenMarkdown($, node));
    return body ? `*${body}*` : "";
  }
  if (name === "a") {
    return linkMarkdown(
      cleanText(childrenMarkdown($, node)),
      element.attr("href"),
    );
  }
  if (/^h[1-6]$/.test(name)) {
    const body = cleanText(childrenMarkdown($, node));
    return body
      ? `\n\n${"#".repeat(Math.min(Number(name[1]), 4))} ${body}\n\n`
      : "";
  }
  if (name === "li") {
    const body = cleanText(childrenMarkdown($, node));
    return body ? `\n- ${body}` : "";
  }
  if (name === "ul" || name === "ol") return `${childrenMarkdown($, node)}\n`;
  if (name === "table") return `\n\n${renderTable($, node)}\n\n`;
  if (name === "dt") {
    const body = cleanText(childrenMarkdown($, node));
    return body ? `\n- **${body.replace(/:$/, "")}:** ` : "";
  }
  if (name === "dd") return `${cleanText(childrenMarkdown($, node))}\n`;

  const body = childrenMarkdown($, node);
  // A tooltip holds the qualification a key fact leaves out, such as the
  // part-time length behind "4 year full-time".
  const tooltip = cleanText(element.attr("title") ?? "");
  const withTooltip =
    tooltip && !cleanText(body).includes(tooltip)
      ? `${body} (${tooltip})`
      : body;
  if (["p", "div", "section", "article", "tr", "blockquote"].includes(name)) {
    const block = cleanMarkdown(withTooltip);
    return block ? `\n\n${block}\n\n` : "";
  }
  return withTooltip;
}

/**
 * Offering tables for several years sit in tabs whose year exists only in the
 * tab menu. The year is written into each pane so a table can be attributed
 * after the menu is removed.
 */
function labelYearTabs($: CheerioAPI) {
  $(".course-tabs-menu a[href^='#']").each((_, link) => {
    const year = cleanText($(link).text());
    const target = $(link).attr("href");
    if (!target || !/^\d{4}$/.test(year)) return;
    $(target).first().prepend(`<h3>Offerings in ${year}</h3>`);
  });
}

function removeBackToTop($: CheerioAPI) {
  $("a").each((_, link) => {
    const text = cleanText($(link).text());
    if (/^back to (?:the )?top$/i.test(text)) $(link).remove();
  });
}

/**
 * The whole visible catalogue content of an ANU Programs and Courses page as
 * Markdown, in page order. It chooses no fields: everything the page states
 * reaches the model, which decides what each part means.
 */
export function convertAnuPageToMarkdown({
  html,
  frontMatter,
}: {
  html: string;
  frontMatter: Record<string, string | number>;
}) {
  const $ = load(html);
  labelYearTabs($);
  $(CHROME_SELECTORS.join(",")).remove();
  removeBackToTop($);

  const roots = $(".intro, .main").toArray();
  const content = (roots.length ? roots : $("body").toArray())
    .map((root) => childrenMarkdown($, root))
    .join("\n\n");
  const header = Object.entries(frontMatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${header}\n---\n\n${cleanMarkdown(content)}\n`;
}
