"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@coursemap/ui/primitives/popover";
import type { AssistantSociety } from "@/lib/assistant/attachments";
import { AssistantPreviewActions } from "./assistant-preview-actions";
import { useHoverPane } from "./use-hover-pane";

export function assistantSocietyHref(society: AssistantSociety) {
  return `/societies/${society.slug}`;
}

/** A society named in a reply, previewed on hover like a course code. */
export function AssistantSocietyLink({
  society,
  text,
  className,
}: {
  society: AssistantSociety;
  /** The words as the reply wrote them, which may differ in case. */
  text: string;
  className: string;
}) {
  const { open, setOpen, triggerProps, paneProps } = useHoverPane();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Link
          href={assistantSocietyHref(society)}
          className={className}
          {...triggerProps}
        >
          {text}
        </Link>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        aria-label={society.name}
        className="flex h-48 w-72 flex-col gap-0 overflow-hidden p-0 text-xs"
        {...paneProps}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2.5">
            {society.logoUrl ? (
              // Society logos come from many hosts, so they skip image optimisation.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={society.logoUrl}
                alt=""
                className="size-9 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users aria-hidden="true" className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {society.name}
              </p>
              <p className="truncate text-muted-foreground">
                {society.category}
              </p>
            </div>
          </div>
          <p className="line-clamp-3 leading-relaxed text-muted-foreground">
            {society.summary}
          </p>
        </div>
        <AssistantPreviewActions
          href={assistantSocietyHref(society)}
          openLabel="Open society"
          question={`Tell me more about ${society.name}.`}
          onAsk={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
