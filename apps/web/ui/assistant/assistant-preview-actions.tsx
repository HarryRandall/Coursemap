"use client";

import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { useAssistant } from "./assistant-provider";

const ACTION =
  "flex items-center justify-center gap-1.5 py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50";

/** The footer every preview pane shares: open the page, or ask about it. */
export function AssistantPreviewActions({
  href,
  openLabel,
  question,
  onAsk,
}: {
  href: string;
  openLabel: string;
  question: string;
  onAsk: () => void;
}) {
  const { askNow, streaming } = useAssistant();
  return (
    <div className="grid shrink-0 grid-cols-2 border-t border-border">
      <Link href={href} className={ACTION}>
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
        {openLabel}
      </Link>
      <button
        type="button"
        disabled={Boolean(streaming)}
        onClick={() => {
          onAsk();
          askNow(question);
        }}
        className={`${ACTION} border-l border-border`}
      >
        <MessageCircle aria-hidden="true" className="size-3.5" />
        Ask in chat
      </button>
    </div>
  );
}
