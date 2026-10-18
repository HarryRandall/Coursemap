"use client";

import { cn } from "@/lib/cn";

/** A few options as buttons side by side, one of them chosen. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  stretch = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Fill the container's width, sharing it between the options. */
  stretch?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1",
        stretch ? "flex w-full" : "inline-flex",
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition",
            stretch && "flex-1 px-2 whitespace-nowrap",
            option.value === value
              ? "bg-card text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
