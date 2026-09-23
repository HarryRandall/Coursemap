/** Evidence the review screen should question, attributed to its field. */
export type UnsupportedModelWording = { fieldKey: string; wording: string };

function words(value: string) {
  return (
    value
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/**
 * The page's words, joined by single spaces, read two ways: with every link
 * target dropped, and with a record link's code kept after its text. A quote
 * may name "Mathematics" or "Mathematics (MATH-MAJ)" and both are the page.
 */
function pageTexts(pageMarkdown: string) {
  const withoutTargets = pageMarkdown.replace(/\[(.*?)\]\([^)]+\)/g, "$1");
  const withCodes = pageMarkdown.replace(
    /\[(.*?)\]\(([A-Z0-9][A-Z0-9-]{1,31})\)/g,
    "$1 $2",
  );
  return [withoutTargets, withCodes].map(
    (text) => ` ${words(text.replace(/\[(.*?)\]\([^)]+\)/g, "$1")).join(" ")} `,
  );
}

/**
 * Whether the page carries the wording word for word. Markdown formatting,
 * punctuation and case are ignored, so a quote survives the page conversion;
 * a paraphrase does not. Wording gathered from several places on the page,
 * such as a section merging two ANU headings, is checked paragraph by
 * paragraph.
 */
function pageSupportsWording(texts: readonly string[], wording: string) {
  return wording.split(/\n\s*\n/).every((paragraph) => {
    const quoted = words(paragraph.replace(/\[(.*?)\]\([^)]+\)/g, "$1"));
    if (quoted.length === 0) return true;
    const needle = ` ${quoted.join(" ")} `;
    return texts.some((text) => text.includes(needle));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every evidence excerpt and every `sourceText` in an extraction that the page
 * does not carry. Nothing is rejected on this basis; the result becomes
 * review warnings so an administrator knows which fields to read against the
 * ANU page.
 */
export function unsupportedModelWording(
  extraction: Record<string, unknown>,
  pageMarkdown: string,
): UnsupportedModelWording[] {
  const texts = pageTexts(pageMarkdown);
  const found = new Map<string, UnsupportedModelWording>();
  const check = (fieldKey: string, wording: unknown) => {
    if (typeof wording !== "string" || !wording.trim()) return;
    if (pageSupportsWording(texts, wording)) return;
    found.set(`${fieldKey}\u0000${wording}`, { fieldKey, wording });
  };
  const visit = (fieldKey: string, value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(fieldKey, item);
    } else if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === "sourceText") check(fieldKey, child);
        else visit(fieldKey, child);
      }
    }
  };
  for (const [field, value] of Object.entries(extraction)) {
    if (field === "evidence" || field === "reviewItems") continue;
    visit(field, value);
  }
  const evidence = extraction.evidence;
  if (Array.isArray(evidence)) {
    for (const item of evidence) {
      if (isRecord(item) && typeof item.fieldKey === "string") {
        check(item.fieldKey.split(/[.[]/)[0], item.evidenceExcerpt);
      }
    }
  }
  return [...found.values()];
}
