"use client";

import type {
  AssistantCourseReference,
  AssistantVisual,
} from "@/lib/assistant/attachments";
import { AssistantIcon } from "./assistant-icon";
import { AssistantReplyActions } from "./assistant-reply-actions";
import { AssistantReplyText } from "./assistant-reply-text";
import { AssistantSteps } from "./assistant-steps";
import { AssistantVisualCard } from "./assistant-visual-card";
import { useWordReveal } from "./use-word-reveal";
import styles from "./assistant-conversation.module.css";

/**
 * One Compass reply, live or saved. The streamed reply and the saved message
 * share a key, so the word-by-word reveal carries on after the stream ends
 * instead of jumping to the full text.
 */
export function AssistantReply({
  text,
  courses,
  visuals = [],
  steps = [],
  modelName,
  live,
  onRetry,
}: {
  text: string;
  courses?: AssistantCourseReference[];
  visuals?: AssistantVisual[];
  steps?: Array<{ label: string; done: boolean }>;
  modelName?: string;
  live: boolean;
  onRetry?: () => void;
}) {
  const reveal = useWordReveal(text, live);
  const writing = live || reveal.revealing;
  const working = live && !text && steps.every((step) => step.done);
  return (
    <article
      aria-label="Compass reply"
      className="group/reply w-full space-y-3 text-sm leading-relaxed"
    >
      <header className="flex items-center gap-2 text-xs">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/10">
          <AssistantIcon className="size-3.5" />
        </span>
        <span className="font-medium text-foreground">Compass</span>
        {modelName ? (
          <span className="text-muted-foreground">{modelName}</span>
        ) : null}
      </header>
      <AssistantSteps steps={steps} live={live && !text} />
      {working ? (
        <p className={styles.shimmer}>
          {steps.length ? "Putting it together..." : "Thinking..."}
        </p>
      ) : null}
      {reveal.text ? (
        <div className="space-y-3">
          <AssistantReplyText
            text={reveal.text}
            courses={courses}
            trailing={
              writing ? (
                <span aria-hidden="true" className={styles.caret} />
              ) : null
            }
          />
        </div>
      ) : null}
      {visuals.length && !reveal.revealing ? (
        <div className="space-y-3 pt-1">
          {visuals.map((visual, index) => (
            <AssistantVisualCard key={index} visual={visual} />
          ))}
        </div>
      ) : null}
      {!writing && text ? (
        <AssistantReplyActions text={text} onRetry={onRetry} />
      ) : null}
    </article>
  );
}
