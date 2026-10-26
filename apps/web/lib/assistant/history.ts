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

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  courses?: AssistantCourseReference[];
  visuals?: AssistantVisual[];
  societies?: AssistantSociety[];
  places?: AssistantPlace[];
  /** The OpenRouter model that wrote the reply. */
  model?: string;
};

export type AssistantDraft = {
  id: string;
  draft: string;
  title?: string;
  model: string;
  updatedAt: string;
  messages: AssistantMessage[];
};

export function assistantTitle(chat: AssistantDraft | undefined) {
  return (
    chat?.title?.trim() ||
    chat?.messages
      .find((message) => message.role === "user")
      ?.text?.trim()
      .replace(/\s+/g, " ")
      .slice(0, 64) ||
    "New chat"
  );
}

function readMessages(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (message): message is AssistantMessage =>
        typeof message === "object" &&
        message !== null &&
        typeof message.id === "string" &&
        typeof message.text === "string" &&
        (message.role === "user" || message.role === "assistant"),
    )
    .map((message) => {
      const courses = Array.isArray(message.courses)
        ? message.courses.flatMap((course) => readCourseReference(course) ?? [])
        : [];
      const visuals = Array.isArray(message.visuals)
        ? message.visuals.flatMap((visual) => readAssistantVisual(visual) ?? [])
        : [];
      const societies = Array.isArray(message.societies)
        ? message.societies.flatMap((item) => readSociety(item) ?? [])
        : [];
      const places = Array.isArray(message.places)
        ? message.places.flatMap((item) => readPlace(item) ?? [])
        : [];
      return {
        id: message.id,
        role: message.role,
        text: message.text,
        ...(courses.length ? { courses } : {}),
        ...(visuals.length ? { visuals } : {}),
        ...(societies.length ? { societies } : {}),
        ...(places.length ? { places } : {}),
        ...(typeof message.model === "string" && message.model
          ? { model: message.model.slice(0, 160) }
          : {}),
      };
    });
}

export function readAssistantHistory(raw: string | null): AssistantDraft[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (chat) =>
          typeof chat === "object" &&
          chat !== null &&
          typeof chat.id === "string" &&
          typeof chat.draft === "string" &&
          typeof chat.model === "string" &&
          typeof chat.updatedAt === "string" &&
          Number.isFinite(Date.parse(chat.updatedAt)),
      )
      .slice(0, 50)
      .map((chat) => ({
        id: chat.id,
        draft: chat.draft,
        title:
          typeof chat.title === "string"
            ? chat.title.trim().slice(0, 64)
            : undefined,
        model: chat.model,
        updatedAt: chat.updatedAt,
        messages: readMessages(chat.messages),
      }));
  } catch {
    return [];
  }
}

export function assistantAge(updatedAt: string, now: number) {
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(updatedAt)) / 60000),
  );
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return `${Math.floor(minutes / 10080)}w`;
}
