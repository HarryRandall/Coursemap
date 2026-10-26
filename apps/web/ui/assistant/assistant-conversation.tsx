"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import type { AssistantMessage } from "@/lib/assistant/history";
import { useAssistant } from "./assistant-provider";
import { AssistantReply } from "./assistant-reply";

export function AssistantConversation({
  messages,
}: {
  messages: AssistantMessage[];
}) {
  const { streaming: stream, active, catalogue, retry } = useAssistant();
  const streaming = stream?.chatId === active?.id ? stream : null;
  const modelName = (id?: string) =>
    id
      ? (catalogue?.models.find((model) => model.id === id)?.name ??
        id.split("/").at(-1))
      : undefined;
  const lastReplyId =
    messages.at(-1)?.role === "assistant" ? messages.at(-1)?.id : undefined;
  const follow = useRef(true);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // The reveal keeps growing the last reply after the stream ends, so follow
  // size changes rather than only new messages.
  useEffect(() => {
    if (!content.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (follow.current) end.current?.scrollIntoView?.({ block: "end" });
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (follow.current) end.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, streaming?.steps.length]);
  // One keyed list for saved messages and the live reply, so the live reply
  // keeps its state when it is saved under the same id.
  const items = [
    ...messages.map((message) =>
      message.role === "user" ? (
        <div
          key={message.id}
          className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-sm"
        >
          <span className="sr-only">You: </span>
          {message.text}
        </div>
      ) : (
        <AssistantReply
          key={message.id}
          text={message.text}
          courses={message.courses}
          visuals={message.visuals}
          societies={message.societies}
          places={message.places}
          modelName={modelName(message.model)}
          live={false}
          onRetry={message.id === lastReplyId && !streaming ? retry : undefined}
        />
      ),
    ),
    streaming ? (
      <AssistantReply
        key={streaming.id}
        text={streaming.text}
        courses={streaming.courses}
        visuals={streaming.visuals}
        societies={streaming.societies}
        places={streaming.places}
        steps={streaming.steps}
        modelName={modelName(active?.model || catalogue?.defaultModel)}
        live
      />
    ) : null,
  ];
  return (
    // The jump button sits outside the scrolling log so it floats over the
    // composer edge instead of over the reply text.
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        onScroll={(event) => {
          const el = event.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setAwayFromEnd(!follow.current);
        }}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-busy={Boolean(streaming)}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
      >
        <div ref={content} className="mx-auto flex max-w-3xl flex-col gap-6">
          {items}
          <div ref={end} />
        </div>
      </div>
      {awayFromEnd ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Jump to latest"
          className="absolute bottom-3 left-1/2 size-9 -translate-x-1/2 rounded-full border-border bg-background text-foreground shadow-lg duration-150 animate-in fade-in-0 zoom-in-95 hover:bg-muted motion-reduce:animate-none"
          onClick={() => {
            follow.current = true;
            setAwayFromEnd(false);
            end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
          }}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
