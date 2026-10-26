export type ReplyInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "course"; code: string }
  | { kind: "page"; href: string; text: string };

export type ReplyBlock =
  | { kind: "paragraph"; lines: ReplyInline[][] }
  | { kind: "list"; ordered: boolean; items: ReplyInline[][] };

/** Coursemap pages Compass may point to, and how a bare path reads. */
export const REPLY_PAGES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/plan": "Plan",
  "/requirements": "Requirements",
  "/courses": "Courses",
  "/academic": "Academic history",
  "/calendar": "Calendar",
  "/profile": "Profile",
  "/onboarding": "Onboarding",
};

const COURSE_CODE = /\b([A-Z]{4}\d{4}[A-Z]?)\b/u;
const BULLET = /^\s*[-*•]\s+/u;
const NUMBERED = /^\s*\d+[.)]\s+/u;
// "[Requirements](/requirements)", "the Plan page (/plan)" or a bare "/plan".
const PAGE_LINK =
  /\[([^\]\n]+)\]\((\/[a-z-]+)\)|((?:[A-Z][a-z]+ )*[A-Z][a-z]+ page) \((\/[a-z-]+)\)|(?<![\w/])(\/[a-z-]+)(?![\w/])/gu;

function courses(text: string): ReplyInline[] {
  return text
    .split(COURSE_CODE)
    .flatMap<ReplyInline>((part, index) =>
      index % 2
        ? [{ kind: "course", code: part }]
        : part
          ? [{ kind: "text", text: part }]
          : [],
    );
}

/** Links to Coursemap pages, leaving unknown paths as written. */
function pages(text: string): ReplyInline[] {
  const parts: ReplyInline[] = [];
  let from = 0;
  for (const match of text.matchAll(PAGE_LINK)) {
    const [whole, label, labelled, named, namedPath, bare] = match;
    const href = labelled ?? namedPath ?? bare;
    if (!(href in REPLY_PAGES)) continue;
    parts.push(...courses(text.slice(from, match.index)));
    parts.push({
      kind: "page",
      href,
      text: label ?? named ?? `${REPLY_PAGES[href]} page`,
    });
    from = match.index + whole.length;
  }
  parts.push(...courses(text.slice(from)));
  return parts;
}

/**
 * Bold runs, page links and course codes. An unclosed `**` while streaming
 * stays literal.
 */
export function parseReplyInline(text: string): ReplyInline[] {
  return text
    .split(/\*\*([^*\n]+)\*\*/u)
    .flatMap((part, index) =>
      index % 2 ? [{ kind: "strong" as const, text: part }] : pages(part),
    );
}

/**
 * Turns the plain text Compass writes into paragraphs and lists. Models are
 * asked for "- " lists but some number them or use bold, so both are read.
 * Partial text parses too, so a reply can be formatted while it streams.
 */
export function parseReply(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  for (const line of text.replace(/\r/gu, "").split("\n")) {
    const last = blocks.at(-1);
    if (!line.trim()) {
      if (last) blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const item = parseReplyInline(
        line.replace(ordered ? NUMBERED : BULLET, ""),
      );
      if (last?.kind === "list" && last.ordered === ordered)
        last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    if (last?.kind === "paragraph") last.lines.push(parseReplyInline(line));
    else blocks.push({ kind: "paragraph", lines: [parseReplyInline(line)] });
  }
  return blocks.filter(
    (block) => block.kind === "list" || block.lines.length > 0,
  );
}
