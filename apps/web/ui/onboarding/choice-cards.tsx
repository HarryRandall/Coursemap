"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChoiceCardOption<T extends string | number> = {
  value: T;
  label: string;
  description?: ReactNode;
};

/**
 * A radio group drawn as selectable cards. Native radios keep arrow-key
 * movement, form semantics and the accessible name without extra ARIA.
 */
export function ChoiceCards<T extends string | number>({
  className,
  columns = 2,
  label,
  onValueChange,
  options,
  value,
}: {
  className?: string;
  columns?: 2 | 3;
  label: string;
  onValueChange: (value: T) => void;
  options: readonly ChoiceCardOption<T>[];
  value: T | null;
}) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{label}</legend>
      <div
        className={cn(
          "grid gap-2.5",
          columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex min-h-14 cursor-pointer flex-col justify-center gap-0.5 rounded-xl border bg-card px-4 py-3 transition-colors",
                "hover:border-primary/40 hover:bg-accent/40",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                checked && "border-primary bg-primary/5 hover:bg-primary/5",
              )}
            >
              <input
                checked={checked}
                className="sr-only"
                name={name}
                onChange={() => onValueChange(option.value)}
                type="radio"
                value={String(option.value)}
              />
              <span className="pr-6 text-sm font-semibold">{option.label}</span>
              {option.description ? (
                <span className="pr-6 text-xs text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 right-3.5 grid size-5 -translate-y-1/2 place-items-center rounded-full border",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {checked ? <Check className="size-3" /> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
