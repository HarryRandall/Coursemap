import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A pill that switches one quick filter on or off. */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-medium ring-1 transition-colors ring-inset focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        pressed
          ? "bg-primary/15 text-primary ring-primary/40"
          : "bg-transparent text-muted-foreground ring-border hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
