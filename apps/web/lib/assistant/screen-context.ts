export const SCREEN_TEXT_MAX_LENGTH = 6_000;

export type AssistantScreen = {
  path: string;
  title: string;
  text: string;
};

/**
 * Collapses rendered page text into the compact form sent with a question.
 * Repeated blank lines and indentation carry no meaning for the model but
 * cost tokens, and the cap keeps a long table from dominating the request.
 */
export function compactScreenText(
  text: string,
  maxLength = SCREEN_TEXT_MAX_LENGTH,
) {
  const compact = text
    .split("\n")
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength)}\n[Page text truncated]`
    : compact;
}

/**
 * Reads what the student can see in the main content panel. `innerText`
 * follows CSS visibility, so collapsed menus and hidden tabs are left out.
 * The Compass panel sits outside the inset and is never included.
 */
export function readAssistantScreen(doc: Document = document): AssistantScreen {
  const main =
    doc.querySelector<HTMLElement>('[data-slot="sidebar-inset"]') ??
    doc.querySelector<HTMLElement>("main");
  return {
    path: `${doc.location?.pathname ?? ""}${doc.location?.search ?? ""}`,
    title: doc.title,
    text: compactScreenText(main?.innerText ?? main?.textContent ?? ""),
  };
}
