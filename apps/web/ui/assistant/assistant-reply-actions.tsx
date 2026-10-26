"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";

/** Copy and, for the latest reply, retry. Shown on hover or focus. */
export function AssistantReplyActions({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex items-center gap-0.5 opacity-100 transition-opacity group-focus-within/reply:opacity-100 group-hover/reply:opacity-100 motion-reduce:transition-none md:opacity-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={copied ? "Copied" : "Copy reply"}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
      >
        {copied ? (
          <Check aria-hidden="true" className="text-success" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Retry reply"
          onClick={onRetry}
        >
          <RotateCcw aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
