export type ReplyInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "course"; code: string };

export type ReplyBlock =
  | { kind: "paragraph"; lines: ReplyInline[][] }
  | { kind: "list"; ordered: boolean; items: ReplyInline[][] };

const COURSE_CODE = /\b([A-Z]{4}\d{4}[A-Z]?)\b/u;
const BULLET = /^\s*[-*•]\s+/u;
const NUMBERED = /^\s*\d+[.)]\s+/u;

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

/** Bold runs and course codes. An unclosed `**` while streaming stays literal. */
export function parseReplyInline(text: string): ReplyInline[] {
  return text
    .split(/\*\*([^*\n]+)\*\*/u)
    .flatMap((part, index) =>
      index % 2 ? [{ kind: "strong" as const, text: part }] : courses(part),
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
