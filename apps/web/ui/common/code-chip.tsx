import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/10 text-primary ring-primary/30",
  met: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  missing:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
};

/** A course code or session in a compact chip, toned by its plan state. */
export function CodeChip({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      {tone === "met" ? (
        <Check size={11} strokeWidth={3} aria-hidden="true" />
      ) : null}
      {tone === "missing" ? (
        <X size={11} strokeWidth={3} aria-hidden="true" />
      ) : null}
      {children}
      {tone === "met" ? (
        <span className="sr-only">(planned before)</span>
      ) : null}
      {tone === "missing" ? (
        <span className="sr-only">(not planned before)</span>
      ) : null}
    </span>
  );
}
