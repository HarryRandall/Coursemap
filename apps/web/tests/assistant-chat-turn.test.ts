import { describe, expect, test, vi } from "vitest";
import {
  ASSISTANT_MAX_TOOL_ROUNDS,
  AssistantToolError,
  runAssistantTurn,
  serialiseToolResult,
} from "@/lib/assistant/chat-turn";
import type { AssistantTool } from "@/lib/assistant/chat-turn";
import { readAssistantEvents } from "@/lib/assistant/chat-events";
import {
  assistantModelOptions,
  resolveAssistantModels,
} from "@/lib/assistant/model-setting";
import { parseReply } from "@/lib/assistant/reply-format";
import { cleanChatTitle } from "@/lib/assistant/chat-title";
import { streamChatRound } from "@/lib/assistant/openrouter-chat";
import { compactScreenText } from "@/lib/assistant/screen-context";
import {
  ASSISTANT_SYSTEM_PROMPT,
  assistantMessages,
} from "@/lib/assistant/system-prompt";

// Next declares NODE_ENV as required, which these modules never read.
const processEnv = (values: Record<string, string>) =>
  values as unknown as NodeJS.ProcessEnv;
const env = processEnv({ OPENROUTER_API_KEY: "test-key" });

function eventStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

/** One OpenRouter streaming response, split mid-line to exercise buffering. */
function sse(...payloads: object[]) {
  const text = [
    ": OPENROUTER PROCESSING\n\n",
    ...payloads.map((payload) => `data: ${JSON.stringify(payload)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
  const middle = Math.floor(text.length / 2);
  return new Response(eventStream([text.slice(0, middle), text.slice(middle)]));
}

const usage = (cost: number) => ({
  usage: { prompt_tokens: 1000, completion_tokens: 50, cost },
  choices: [],
});

function toolCallRound(name: string, args: string) {
  return sse(
    {
      model: "anthropic/claude-haiku-5.5",
      choices: [
        {
          delta: {
            content: "Let me check.",
            tool_calls: [
              { index: 0, id: "call_1", function: { name, arguments: "" } },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: args } }] },
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    usage(0.001),
  );
}

function answerRound(text: string) {
  return sse(
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
    usage(0.0005),
  );
}

function fakeTool(name: string, run: AssistantTool["run"]): AssistantTool {
  return {
    label: `Running ${name}`,
    run,
    definition: {
      type: "function",
      function: { name, description: name, parameters: { type: "object" } },
    },
  };
}

describe("streamChatRound", () => {
  test("streams text and assembles tool calls split across chunks", async () => {
    const fetchImpl = vi.fn(async () =>
      toolCallRound("get_course", '{"code":"COMP1100"}'),
    );
    const text: string[] = [];
    const round = await streamChatRound({
      models: ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"],
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      maxOutputTokens: 100,
      onText: (delta) => text.push(delta),
      env,
      fetchImpl,
    });
    expect(text).toEqual(["Let me check."]);
    expect(round.toolCalls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "get_course", arguments: '{"code":"COMP1100"}' },
      },
    ]);
    expect(round.usage).toMatchObject({ inputTokens: 1000, costUsd: 0.001 });
    const body = JSON.parse(
      String(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(body).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      models: ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"],
      stream: true,
      usage: { include: true },
      provider: { data_collection: "deny" },
    });
  });

  test("refuses to call the model without a key", async () => {
    await expect(
      streamChatRound({
        models: ["anthropic/claude-haiku-5.5"],
        messages: [],
        tools: [],
        maxOutputTokens: 100,
        onText: () => {},
        env: processEnv({}),
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow("Compass is not configured yet.");
  });
});

describe("runAssistantTurn", () => {
  test("runs a requested tool and answers with its result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(toolCallRound("get_course", '{"code":"COMP1100"}'))
      .mockResolvedValueOnce(answerRound("COMP1100 runs in S1."));
    const run = vi.fn(async () => ({ code: "COMP1100", offerings: ["S1"] }));
    const text: string[] = [];
    const tools: string[] = [];
    const rounds: number[] = [];
    await runAssistantTurn({
      models: ["anthropic/claude-haiku-5.5"],
      messages: [{ role: "user", content: "When is COMP1100?" }],
      tools: [
        {
          ...fakeTool("get_course", run),
          describe: (input) => `Looking up ${String(input.code)}`,
        },
      ],
      onText: (delta) => text.push(delta),
      onAside: () => text.push("|aside|"),
      onTool: (step) => tools.push(`${step.label}:${step.done}`),
      onRound: (round) => rounds.push(round.usage.costUsd),
      env,
      fetchImpl,
    });
    expect(run).toHaveBeenCalledWith({ code: "COMP1100" });
    expect(tools).toEqual([
      "Looking up COMP1100:false",
      "Looking up COMP1100:true",
    ]);
    expect(text.join("")).toBe("Let me check.|aside|COMP1100 runs in S1.");
    expect(rounds).toEqual([0.001, 0.0005]);
    const second = JSON.parse(
      String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body),
    );
    expect(second.messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"code":"COMP1100","offerings":["S1"]}',
    });
  });

  test("passes safe tool errors to the model and hides unexpected ones", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(toolCallRound("get_course", "not json"))
      .mockResolvedValueOnce(answerRound("Sorry."))
      .mockResolvedValueOnce(toolCallRound("get_course", "{}"))
      .mockResolvedValueOnce(answerRound("Sorry."));
    const turn = (run: AssistantTool["run"]) =>
      runAssistantTurn({
        models: ["openai/gpt-6-luna"],
        messages: [{ role: "user", content: "?" }],
        tools: [fakeTool("get_course", run)],
        onText: () => {},
        onAside: () => {},
        onTool: () => {},
        onRound: () => {},
        env,
        fetchImpl,
      });
    await turn(async () => {
      throw new AssistantToolError("ABCD is not an ANU course code.");
    });
    await turn(async () => {
      throw new Error("connection string leaked");
    });
    const toolResult = (call: number) =>
      JSON.parse(
        String((fetchImpl.mock.calls[call] as [string, RequestInit])[1].body),
      ).messages.at(-1).content;
    expect(toolResult(1)).toContain("ABCD is not an ANU course code.");
    expect(toolResult(3)).not.toContain("leaked");
  });

  test("forces an answer once the tool round limit is reached", async () => {
    const fetchImpl = vi.fn(async () => toolCallRound("search_courses", "{}"));
    const run = vi.fn(async () => ({ courses: [] }));
    await runAssistantTurn({
      models: ["openai/gpt-6-luna"],
      messages: [{ role: "user", content: "?" }],
      tools: [fakeTool("search_courses", run)],
      onText: () => {},
      onAside: () => {},
      onTool: () => {},
      onRound: () => {},
      env,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(ASSISTANT_MAX_TOOL_ROUNDS + 1);
    expect(run).toHaveBeenCalledTimes(ASSISTANT_MAX_TOOL_ROUNDS);
    const last = JSON.parse(
      String(
        (fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit])[1]
          .body,
      ),
    );
    expect(last.tool_choice).toBe("none");
  });
});

test("truncates long tool results", () => {
  const result = serialiseToolResult({ text: "x".repeat(20_000) });
  expect(result.length).toBeLessThan(8_100);
  expect(result).toMatch(/result truncated/u);
});

test("compacts page text and caps its length", () => {
  expect(compactScreenText("  Plan \n\n\n   COMP1100   Programming \n")).toBe(
    "Plan\nCOMP1100 Programming",
  );
  expect(compactScreenText("a".repeat(50), 10)).toBe(
    "aaaaaaaaaa\n[Page text truncated]",
  );
});

test("attaches the screen only to the newest question", () => {
  const messages = assistantMessages({
    model: "anthropic/claude-haiku-5.5",
    history: [
      { role: "assistant", text: "A reply whose question was trimmed" },
      { role: "user", text: "First" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "And this course?" },
    ],
    screen: {
      path: "/courses/2026/comp1100",
      title: "COMP1100",
      text: "Prerequisites: none",
    },
    today: "2026-10-26",
  });
  expect(messages[0]).toEqual({
    role: "system",
    content: [
      {
        type: "text",
        text: ASSISTANT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
  });
  expect(messages[1]).toEqual({ role: "user", content: "First" });
  expect(messages[3].content).toMatch(
    /^<screen>\nToday is 2026-10-26\.\nThe student is on \/courses\/2026\/comp1100 \(COMP1100\)/u,
  );
  expect(messages[3].content).toMatch(/And this course\?$/u);
  expect(
    assistantMessages({
      model: "openai/gpt-6-luna",
      history: [{ role: "user", text: "Hi" }],
      screen: null,
      today: "2026-10-26",
    })[0],
  ).toEqual({ role: "system", content: ASSISTANT_SYSTEM_PROMPT });
});

test("offers three cheap models and only runs listed ones", () => {
  expect(
    assistantModelOptions(processEnv({})).map((model) => model.id),
  ).toEqual([
    "anthropic/claude-haiku-5.5",
    "openai/gpt-6-luna",
    "qwen/qwen3.7-flash",
  ]);
  expect(resolveAssistantModels("qwen/qwen3.7-flash", processEnv({}))).toEqual([
    "qwen/qwen3.7-flash",
    "anthropic/claude-haiku-5.5",
  ]);
  expect(resolveAssistantModels("openai/gpt-6-pro", processEnv({}))).toEqual([
    "anthropic/claude-haiku-5.5",
  ]);
  expect(
    assistantModelOptions(
      processEnv({
        COURSEMAP_ASSISTANT_MODELS: " DeepSeek/deepseek-v4-flash , not a model",
      }),
    ),
  ).toEqual([
    {
      id: "deepseek/deepseek-v4-flash",
      name: "deepseek-v4-flash",
      description: "",
    },
  ]);
});

test("formats replies into paragraphs, lists, bold and course codes", () => {
  expect(
    parseReply(
      "Two problems.\n\n- **COMP3500** needs a GPA of 6\n- Electives short\n1. Move it\nThen check /plan.",
    ),
  ).toEqual([
    { kind: "paragraph", lines: [[{ kind: "text", text: "Two problems." }]] },
    {
      kind: "list",
      ordered: false,
      items: [
        [
          { kind: "strong", text: "COMP3500" },
          { kind: "text", text: " needs a GPA of 6" },
        ],
        [{ kind: "text", text: "Electives short" }],
      ],
    },
    {
      kind: "list",
      ordered: true,
      items: [[{ kind: "text", text: "Move it" }]],
    },
    {
      kind: "paragraph",
      lines: [[{ kind: "text", text: "Then check /plan." }]],
    },
  ]);
  expect(parseReply("Take COMP2120 next")).toEqual([
    {
      kind: "paragraph",
      lines: [
        [
          { kind: "text", text: "Take " },
          { kind: "course", code: "COMP2120" },
          { kind: "text", text: " next" },
        ],
      ],
    },
  ]);
  expect(parseReply("Partly **bold")).toEqual([
    { kind: "paragraph", lines: [[{ kind: "text", text: "Partly **bold" }]] },
  ]);
});

test("reads newline-delimited chat events across chunk boundaries", async () => {
  const events = [];
  for await (const event of readAssistantEvents(
    eventStream(['{"type":"te', 'xt","delta":"Hi"}\n{"type":"done"}\nnoise\n']),
  ))
    events.push(event);
  expect(events).toEqual([
    { type: "text", delta: "Hi" },
    { type: "done", model: "" },
  ]);
});

test("trims a generated chat title to fit the switcher", () => {
  expect(cleanChatTitle('"GPA and requirement progress."\nExtra')).toBe(
    "GPA and requirement progress",
  );
  expect(cleanChatTitle("**Fixing COMP3500 prerequisites**")).toBe(
    "Fixing COMP3500 prerequisites",
  );
  expect(cleanChatTitle("  ")).toBeNull();
});
