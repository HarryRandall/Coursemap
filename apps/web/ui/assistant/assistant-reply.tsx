"use client";

import type {
  AssistantCourseReference,
  AssistantPlace,
  AssistantSociety,
  AssistantVisual,
} from "@/lib/assistant/attachments";
import { AssistantPlaceCard } from "./assistant-place-card";
import { AssistantSocietyCard } from "./assistant-society-card";
import { AssistantIcon } from "./assistant-icon";
import { AssistantReplyActions } from "./assistant-reply-actions";
import { AssistantReplyText } from "./assistant-reply-text";
import { AssistantActivity } from "./assistant-activity";
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
  societies = [],
  places = [],
  steps = [],
  modelName,
  live,
  onRetry,
}: {
  text: string;
  courses?: AssistantCourseReference[];
  visuals?: AssistantVisual[];
  societies?: AssistantSociety[];
  places?: AssistantPlace[];
  steps?: Array<{ label: string; done: boolean }>;
  modelName?: string;
  live: boolean;
  onRetry?: () => void;
}) {
  const reveal = useWordReveal(text, live);
  const writing = live || reveal.revealing;
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
      {live && !reveal.text ? <AssistantActivity steps={steps} /> : null}
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
      {/* Cards and charts illustrate the answer, so they follow it once it
          is written. */}
      {(societies.length || places.length) && !writing ? (
        <div className="grid gap-2 duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none sm:grid-cols-2">
          {places.map((place) => (
            <AssistantPlaceCard key={place.slug} place={place} />
          ))}
          {societies.map((society) => (
            <AssistantSocietyCard key={society.slug} society={society} />
          ))}
        </div>
      ) : null}
      {visuals.length && !writing ? (
        <div className="space-y-3 duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
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
