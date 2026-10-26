import "server-only";

import { streamChatRound } from "./openrouter-chat";
import type {
  ChatMessage,
  ChatToolDefinition,
  ChatUsage,
} from "./openrouter-chat";

/** Tool rounds per reply. The last round must answer with what it has. */
export const ASSISTANT_MAX_TOOL_ROUNDS = 4;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 1_500;
// Tool results are re-sent on every later round, so a long search result is
// paid for several times. The cap keeps one result from dominating the bill.
export const ASSISTANT_TOOL_RESULT_MAX_LENGTH = 8_000;

export type AssistantTool = {
  definition: ChatToolDefinition;
  /** Short present-tense status shown while the tool runs. */
  label: string;
  /** Tools that only present something, such as a chart, show no step. */
  silent?: boolean;
  /** A more specific status for one call, such as "Looking up COMP1100". */
  describe?: (input: Record<string, unknown>) => string | null;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

/** One tool call as the student sees it, reported when it starts and ends. */
export type AssistantToolStep = { id: string; label: string; done: boolean };

/** What one completion round consumed, reported even if a later round fails. */
export type AssistantRoundUsage = {
  model: string | null;
  usage: ChatUsage;
  toolCalls: number;
};

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function serialiseToolResult(value: unknown) {
  const text = JSON.stringify(value ?? null);
  return text.length > ASSISTANT_TOOL_RESULT_MAX_LENGTH
    ? `${text.slice(0, ASSISTANT_TOOL_RESULT_MAX_LENGTH)}... [result truncated; narrow the request for more]`
    : text;
}

/**
 * Runs one Compass reply: streams model text through `onText`, runs any tool
 * calls the model makes and feeds their results back until the model answers
 * or the round limit is reached. Each finished round is reported through
 * `onRound` so usage is still recorded when the student stops a reply.
 */
export async function runAssistantTurn({
  models,
  messages,
  tools,
  onText,
  onAside,
  onTool,
  onRound,
  signal,
  env,
  fetchImpl,
}: {
  models: string[];
  messages: ChatMessage[];
  tools: AssistantTool[];
  onText: (delta: string) => void;
  /** The text streamed since the last call was narration before tool calls. */
  onAside: () => void;
  onTool: (step: AssistantToolStep) => void;
  onRound: (round: AssistantRoundUsage) => void;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}) {
  const byName = new Map(
    tools.map((tool) => [tool.definition.function.name, tool]),
  );
  const conversation = [...messages];
  for (let round = 0; round <= ASSISTANT_MAX_TOOL_ROUNDS; round += 1) {
    const finalRound = round === ASSISTANT_MAX_TOOL_ROUNDS;
    const result = await streamChatRound({
      models,
      messages: conversation,
      tools: tools.map((tool) => tool.definition),
      toolChoice: finalRound ? "none" : "auto",
      maxOutputTokens: ASSISTANT_MAX_OUTPUT_TOKENS,
      onText,
      signal,
      env,
      fetchImpl,
    });
    const toolCalls = finalRound ? [] : result.toolCalls;
    onRound({
      model: result.model,
      usage: result.usage,
      toolCalls: toolCalls.length,
    });
    if (!toolCalls.length) {
      if (result.finishReason === "length")
        onText("\n\nThis reply reached its length limit. Ask me to continue.");
      return;
    }

    // Text before a tool call, such as "Let me check", has already streamed.
    // The steps already say what Compass is doing, so it is not the answer.
    if (result.content) onAside();
    conversation.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: toolCalls,
    });
    const outputs = await Promise.all(
      toolCalls.map(async (call) => {
        const tool = byName.get(call.function.name);
        if (!tool) return { error: `Unknown tool ${call.function.name}.` };
        const input = parseArguments(call.function.arguments);
        const step = {
          id: call.id,
          label: tool.describe?.(input) || tool.label,
        };
        if (!tool.silent) onTool({ ...step, done: false });
        try {
          return await tool.run(input);
        } catch (error) {
          return {
            error:
              error instanceof Error && error.name === "AssistantToolError"
                ? error.message
                : "The tool failed. Answer without it or try a narrower request.",
          };
        } finally {
          if (!tool.silent) onTool({ ...step, done: true });
        }
      }),
    );
    toolCalls.forEach((call, index) =>
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: serialiseToolResult(outputs[index]),
      }),
    );
  }
}

/** An error whose message is safe to show the model and the student. */
export class AssistantToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantToolError";
  }
}
