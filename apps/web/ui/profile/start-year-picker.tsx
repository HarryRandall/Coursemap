"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import { cn } from "@/lib/cn";

/** The start year as a button that opens a grid of the years on offer. */
export function StartYearPicker({
  years,
  value,
  currentYear,
  onChange,
}: {
  years: readonly number[];
  value: number;
  currentYear: number;
  onChange: (year: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...years].sort((a, b) => a - b);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Start year, ${value}`}
          className="-ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 py-0.5 text-sm font-semibold text-foreground tabular-nums transition-colors outline-none hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border data-[state=open]:bg-muted motion-reduce:transition-none"
        >
          {value}
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Year you started
        </p>
        <div
          role="group"
          aria-label="Start year"
          className="grid grid-cols-3 gap-1.5"
        >
          {sorted.map((year) => (
            <button
              key={year}
              type="button"
              aria-pressed={year === value}
              onClick={() => {
                onChange(year);
                setOpen(false);
              }}
              className={cn(
                "cursor-pointer rounded-md py-2 text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                year === value
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-foreground hover:bg-muted",
                year === currentYear &&
                  year !== value &&
                  "ring-1 ring-primary/40 ring-inset",
              )}
            >
              {year}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
