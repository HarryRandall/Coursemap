import "server-only";

import { getCanonicalSiteOrigin } from "@/lib/supabase/config";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system"; content: string | ChatContentPart[] }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ChatContentPart = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
};

export type ChatRound = {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
  model: string | null;
  usage: ChatUsage;
};

export class AssistantModelError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AssistantModelError";
    this.status = status;
  }
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function readChatUsage(value: unknown): ChatUsage {
  const usage =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const details =
    typeof usage.prompt_tokens_details === "object" &&
    usage.prompt_tokens_details !== null
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : {};
  return {
    inputTokens: count(usage.prompt_tokens),
    outputTokens: count(usage.completion_tokens),
    cachedInputTokens: count(details.cached_tokens),
    costUsd: count(usage.cost),
  };
}

/**
 * Yields each `data:` payload from an OpenRouter server-sent event stream.
 * Comment lines such as `: OPENROUTER PROCESSING` keep the connection alive and
 * are skipped.
 */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          // A malformed keep-alive or partial frame carries no usable delta.
        }
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

type StreamChunk = {
  model?: unknown;
  error?: { message?: unknown };
  usage?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    delta?: {
      content?: unknown;
      tool_calls?: Array<{
        index?: unknown;
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
      }>;
    };
  }>;
};

/**
 * Streams one completion round. Text deltas reach `onText` as they arrive;
 * tool calls are returned whole once the round finishes so the caller can run
 * them and start the next round.
 */
export async function streamChatRound({
  models,
  messages,
  tools,
  toolChoice = "auto",
  maxOutputTokens,
  onText,
  signal,
  env = process.env,
  fetchImpl = fetch,
}: {
  models: string[];
  messages: ChatMessage[];
  tools: ChatToolDefinition[];
  toolChoice?: "auto" | "none";
  maxOutputTokens: number;
  onText: (delta: string) => void;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ChatRound> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey)
    throw new AssistantModelError("Compass is not configured yet.", 503);
  const origin = getCanonicalSiteOrigin();
  const response = await fetchImpl(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Coursemap Compass",
      ...(origin ? { "HTTP-Referer": origin } : {}),
    },
    body: JSON.stringify({
      // OpenRouter tries the later models only when the first is unavailable.
      model: models[0],
      ...(models.length > 1 ? { models } : {}),
      messages,
      ...(tools.length
        ? { tools, tool_choice: toolChoice, parallel_tool_calls: true }
        : {}),
      temperature: 0.3,
      max_tokens: maxOutputTokens,
      stream: true,
      usage: { include: true },
      // Hidden reasoning counts against max_tokens and once cut a reply off
      // mid-sentence; plan questions are answered from tool data instead.
      reasoning: { enabled: false },
      provider: { data_collection: "deny" },
    }),
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    throw new AssistantModelError(
      response.status === 429
        ? "Compass is busy. Try again in a minute."
        : response.status === 401 || response.status === 403
          ? "Compass is not configured correctly."
          : response.status === 402
            ? "Compass has run out of model credit."
            : "Compass could not reach the model.",
      response.status,
    );
  }

  let content = "";
  let finishReason: string | null = null;
  let model: string | null = null;
  let usage = readChatUsage(null);
  const calls: Array<{ id: string; name: string; arguments: string }> = [];
  for await (const value of readServerSentEvents(response.body)) {
    const chunk = value as StreamChunk;
    if (chunk.error) {
      throw new AssistantModelError("Compass could not reach the model.", 502);
    }
    if (typeof chunk.model === "string") model = chunk.model;
    if (chunk.usage) usage = readChatUsage(chunk.usage);
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (typeof choice.finish_reason === "string")
      finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (typeof delta?.content === "string" && delta.content) {
      content += delta.content;
      onText(delta.content);
    }
    for (const part of delta?.tool_calls ?? []) {
      const index = typeof part.index === "number" ? part.index : calls.length;
      calls[index] ??= { id: "", name: "", arguments: "" };
      if (typeof part.id === "string") calls[index].id = part.id;
      if (typeof part.function?.name === "string")
        calls[index].name += part.function.name;
      if (typeof part.function?.arguments === "string")
        calls[index].arguments += part.function.arguments;
    }
  }
  return {
    content,
    finishReason,
    model,
    usage,
    toolCalls: calls
      .filter((call) => call?.name)
      .map((call, index) => ({
        id: call.id || `call_${index}`,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments || "{}" },
      })),
  };
}
