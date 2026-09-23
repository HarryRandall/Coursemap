/** Evidence the review screen should question, attributed to its field. */
export type UnsupportedModelWording = { fieldKey: string; wording: string };

function normalisedWords(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/\[(.*?)\]\([^)]+\)/g, "$1")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/**
 * Whether the page carries the wording word for word. Markdown formatting,
 * punctuation, case and link targets are ignored, so a quote survives the
 * page conversion; a paraphrase does not. `pageText` is the page's words
 * joined by single spaces.
 */
function pageSupportsWording(pageText: string, wording: string) {
  const words = normalisedWords(wording);
  return words.length === 0 || pageText.includes(` ${words.join(" ")} `);
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
  const pageText = ` ${normalisedWords(pageMarkdown).join(" ")} `;
  const found = new Map<string, UnsupportedModelWording>();
  const check = (fieldKey: string, wording: unknown) => {
    if (typeof wording !== "string" || !wording.trim()) return;
    if (pageSupportsWording(pageText, wording)) return;
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
