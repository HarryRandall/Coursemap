"use client";

import { ArrowUp, Mic } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { useAssistant } from "./assistant-provider";
import { AssistantTools } from "./assistant-tools";
import { AssistantModelPicker } from "./assistant-model-picker";

export function AssistantComposer({
  onSend,
  model,
  onModelChange,
  draft,
  onDraftChange,
}: {
  onSend: () => void;
  model: string;
  onModelChange: (value: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
}) {
  const { streaming } = useAssistant();
  return (
    <form
      className="shrink-0 space-y-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="rounded-xl border border-border bg-muted/40 p-2 focus-within:ring-2 focus-within:ring-ring/30">
        <Textarea
          aria-label="Message the assistant"
          placeholder="Ask anything..."
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          className="max-h-32 min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-1">
          <AssistantTools />
          <AssistantModelPicker value={model} onChange={onModelChange} />
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="Microphone"
          >
            <Mic aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="submit"
            size="icon-sm"
            disabled={!draft.trim() || Boolean(streaming)}
            aria-label="Send message"
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
      </div>
    </form>
  );
}
