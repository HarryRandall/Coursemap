"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";

function ReplyAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Copy and, for the latest reply, retry, at the reply's right edge. On wider
 * screens they appear when the reply is hovered or focused.
 */
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
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity group-focus-within/reply:opacity-100 group-hover/reply:opacity-100 motion-reduce:transition-none md:opacity-0">
        <ReplyAction
          label={copied ? "Copied" : "Copy reply"}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(text)
              .then(() => setCopied(true));
          }}
        >
          {copied ? (
            <Check aria-hidden="true" className="text-success" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </ReplyAction>
        {onRetry ? (
          <ReplyAction label="Retry reply" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
          </ReplyAction>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
