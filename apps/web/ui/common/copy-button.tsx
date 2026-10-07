"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";

/** Copies a value and confirms it in place for a moment. */
export function CopyButton({
  value,
  label,
  variant = "outline",
}: {
  value: string;
  /** What is copied, for the accessible name, such as "token". */
  label: string;
  variant?: "outline" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="text-success" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
