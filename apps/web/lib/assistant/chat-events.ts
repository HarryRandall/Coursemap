import {
  readAssistantVisual,
  readCourseReference,
  readPlace,
  readSociety,
} from "./attachments";
import type {
  AssistantCourseReference,
  AssistantPlace,
  AssistantSociety,
  AssistantVisual,
} from "./attachments";
import type { AssistantScreen } from "./screen-context";

export type AssistantChatRequest = {
  chatId: string;
  model?: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  screen: AssistantScreen | null;
};

/** One newline-delimited JSON line in the chat route's response stream. */
export type AssistantChatEvent =
  | { type: "text"; delta: string }
  /** The text since the previous aside was narration, not the answer. */
  | { type: "aside" }
  | { type: "tool"; id: string; label: string; done: boolean }
  | { type: "course"; course: AssistantCourseReference }
  | { type: "visual"; visual: AssistantVisual }
  | { type: "society"; society: AssistantSociety }
  | { type: "place"; place: AssistantPlace }
  | { type: "title"; title: string }
  | { type: "done"; model: string }
  | { type: "error"; message: string };

export function encodeAssistantEvent(event: AssistantChatEvent) {
  return `${JSON.stringify(event)}\n`;
}

function readEvent(line: string): AssistantChatEvent | null {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null || !("type" in value))
      return null;
    const event = value as Record<string, unknown>;
    if (event.type === "text" && typeof event.delta === "string")
      return { type: "text", delta: event.delta };
    if (
      event.type === "tool" &&
      typeof event.id === "string" &&
      typeof event.label === "string"
    )
      return {
        type: "tool",
        id: event.id,
        label: event.label.slice(0, 120),
        done: event.done === true,
      };
    if (event.type === "error" && typeof event.message === "string")
      return { type: "error", message: event.message };
    if (event.type === "course") {
      const course = readCourseReference(event.course);
      return course ? { type: "course", course } : null;
    }
    if (event.type === "society") {
      const society = readSociety(event.society);
      return society ? { type: "society", society } : null;
    }
    if (event.type === "place") {
      const place = readPlace(event.place);
      return place ? { type: "place", place } : null;
    }
    if (event.type === "visual") {
      const visual = readAssistantVisual(event.visual);
      return visual ? { type: "visual", visual } : null;
    }
    if (event.type === "aside") return { type: "aside" };
    if (event.type === "title" && typeof event.title === "string")
      return { type: "title", title: event.title.slice(0, 64) };
    if (event.type === "done")
      return {
        type: "done",
        model: typeof event.model === "string" ? event.model.slice(0, 160) : "",
      };
    return null;
  } catch {
    return null;
  }
}

export async function* readAssistantEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AssistantChatEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const event = line.trim() ? readEvent(line) : null;
        if (event) yield event;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
