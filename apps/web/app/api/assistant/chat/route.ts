import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAssistantAllowance } from "@/lib/assistant/allowance";
import type { AssistantCourseReference } from "@/lib/assistant/attachments";
import { encodeAssistantEvent } from "@/lib/assistant/chat-events";
import type { AssistantChatEvent } from "@/lib/assistant/chat-events";
import { runAssistantTurn } from "@/lib/assistant/chat-turn";
import type { AssistantRoundUsage } from "@/lib/assistant/chat-turn";
import { generateChatTitle } from "@/lib/assistant/chat-title";
import {
  assistantTitleModel,
  resolveAssistantModels,
} from "@/lib/assistant/model-setting";
import { AssistantModelError } from "@/lib/assistant/openrouter-chat";
import { SCREEN_TEXT_MAX_LENGTH } from "@/lib/assistant/screen-context";
import { assistantMessages } from "@/lib/assistant/system-prompt";
import { assistantTools } from "@/lib/assistant/tools";
import { getAuthViewer } from "@/lib/auth/viewer";
import { canberraTodayIso } from "@/lib/canberra-format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const chatRequestSchema = z.object({
  chatId: z.uuid(),
  model: z.string().max(160).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(12)
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "The last message must be the student's question.",
    }),
  screen: z
    .object({
      path: z.string().max(400),
      title: z.string().max(200),
      text: z.string().max(SCREEN_TEXT_MAX_LENGTH + 40),
    })
    .nullable(),
});

export async function POST(request: Request) {
  const viewer = await getAuthViewer();
  if (!viewer)
    return NextResponse.json(
      { error: "Sign in to use Compass." },
      { status: 401 },
    );
  const parsed = chatRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Compass could not read that message." },
      { status: 400 },
    );

  const supabase = await createClient();
  const allowance = await loadAssistantAllowance(supabase, viewer.id).catch(
    () => null,
  );
  if (!allowance)
    return NextResponse.json(
      { error: "Compass is temporarily unavailable." },
      { status: 503 },
    );
  if (!allowance.allowed)
    return NextResponse.json(
      {
        error:
          allowance.messagesToday >= allowance.dailyMessageLimit
            ? `You have used today's ${allowance.dailyMessageLimit} Compass messages. Try again tomorrow.`
            : "You have reached this month's Compass allowance.",
      },
      { status: 429 },
    );

  const { chatId, messages, screen } = parsed.data;
  const models = resolveAssistantModels(parsed.data.model);
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AssistantChatEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeAssistantEvent(event)));
        } catch {
          // The student closed the panel or stopped the reply.
        }
      };
      const referenced = new Map<string, AssistantCourseReference>();
      const spent = {
        model: models[0],
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        toolCalls: 0,
      };
      const addRound = ({ model, usage, toolCalls }: AssistantRoundUsage) => {
        spent.model = model ?? spent.model;
        spent.inputTokens += usage.inputTokens;
        spent.cachedInputTokens += usage.cachedInputTokens;
        spent.outputTokens += usage.outputTokens;
        spent.costUsd += usage.costUsd;
        spent.toolCalls += toolCalls;
      };
      // The first question also gets a short title, written alongside the reply.
      const title =
        messages.length === 1
          ? generateChatTitle({
              model: assistantTitleModel(),
              question: messages[0].text,
              signal: request.signal,
            }).then(({ title, usage }) => {
              if (usage) addRound({ model: null, usage, toolCalls: 0 });
              if (title) send({ type: "title", title });
            })
          : null;
      try {
        await runAssistantTurn({
          models,
          messages: assistantMessages({
            model: models[0],
            history: messages,
            screen,
            today: canberraTodayIso(),
          }),
          tools: assistantTools(viewer, {
            // Lookups know different things about a course, such as its
            // place in the plan or its offerings, so each one adds to it.
            onCourse: (course) => {
              const known = referenced.get(course.code);
              // The plan's view of a course outranks a catalogue lookup.
              const merged = known?.planStatus
                ? {
                    ...course,
                    planStatus: known.planStatus,
                    prerequisitesMet: known.prerequisitesMet,
                  }
                : { ...known, ...course };
              if (JSON.stringify(known) === JSON.stringify(merged)) return;
              referenced.set(course.code, merged);
              send({ type: "course", course: merged });
            },
            onVisual: (visual) => send({ type: "visual", visual }),
            onSociety: (society) => send({ type: "society", society }),
            onPlace: (place) => send({ type: "place", place }),
          }),
          onText: (delta) => send({ type: "text", delta }),
          onAside: () => send({ type: "aside" }),
          onTool: (step) => send({ type: "tool", ...step }),
          onRound: addRound,
          signal: request.signal,
        });
        await title;
        send({ type: "done", model: spent.model });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("Compass reply failed.", error);
          send({
            type: "error",
            message:
              error instanceof AssistantModelError
                ? error.message
                : "Compass could not finish this reply. Try again.",
          });
        }
      } finally {
        // A stopped or failed reply still counts towards the allowance, so
        // repeatedly starting and stopping replies cannot avoid the limit.
        const { error } = await supabase.from("assistant_usage").insert({
          owner_id: viewer.id,
          chat_id: chatId,
          model: spent.model,
          input_tokens: spent.inputTokens,
          cached_input_tokens: spent.cachedInputTokens,
          output_tokens: spent.outputTokens,
          cost_usd: spent.costUsd,
          tool_calls: spent.toolCalls,
          latency_ms: Date.now() - startedAt,
        });
        if (error) console.error("Compass usage could not be recorded.", error);
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled request.
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
