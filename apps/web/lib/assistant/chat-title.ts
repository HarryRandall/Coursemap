import "server-only";

import { streamChatRound } from "./openrouter-chat";
import type { ChatUsage } from "./openrouter-chat";

const TITLE_PROMPT =
  'Write a title of two to four words for a chat that starts with the student\'s message below, such as "COMP gap options" or "GPA and requirements". Use sentence case, no quotes and no final full stop. Reply with the title only.';

/**
 * Trims what a model returns into a title that fits the chat switcher, in
 * sentence case. Words written in capitals, such as COMP or ANU, keep them.
 */
export function cleanChatTitle(raw: string) {
  const words = raw
    .split("\n")[0]
    .replace(/^["'\s*#]+|["'\s*.]+$/gu, "")
    .replace(/\s*&\s*/gu, " and ")
    .split(/\s+/u)
    .filter(Boolean)
    .map((word, index) =>
      index && /^[A-Z][a-z]+$/u.test(word) ? word.toLowerCase() : word,
    );
  let title = "";
  for (const word of words) {
    const next = title ? `${title} ${word}` : word;
    if (next.length > 40) break;
    title = next;
  }
  return title.length >= 3 ? title : null;
}

/**
 * Summarises the first message as a short chat title. Returns null rather
 * than failing, since the first words of the question still make a title.
 */
export async function generateChatTitle({
  model,
  question,
  signal,
}: {
  model: string;
  question: string;
  signal?: AbortSignal;
}): Promise<{ title: string | null; usage: ChatUsage | null }> {
  try {
    const round = await streamChatRound({
      models: [model],
      messages: [
        { role: "system", content: TITLE_PROMPT },
        { role: "user", content: question.slice(0, 1_000) },
      ],
      tools: [],
      maxOutputTokens: 24,
      onText: () => {},
      signal,
    });
    return { title: cleanChatTitle(round.content), usage: round.usage };
  } catch {
    return { title: null, usage: null };
  }
}
