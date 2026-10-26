import "server-only";

import { streamChatRound } from "./openrouter-chat";
import type { ChatUsage } from "./openrouter-chat";

const TITLE_PROMPT =
  "Write a title of three to six words for a chat that starts with the student's message below. Use sentence case, no quotes and no final full stop. Reply with the title only.";

/** Trims what a model returns into a title that fits the chat switcher. */
export function cleanChatTitle(raw: string) {
  const title = raw
    .split("\n")[0]
    .replace(/^["'\s*#]+|["'\s*.]+$/gu, "")
    .replace(/\s+/gu, " ")
    .slice(0, 64);
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
