"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";

import { useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";
import { MenuHint } from "@/ui/common/menu-hint";
import { OptionMenu } from "@/ui/common/option-menu";

export type YearSelection = number | "all";

/** Past this many years the list is worth narrowing by typing. */
const SEARCHABLE_FROM = 8;

/**
 * One academic year. It is built from the same popover and option list as the
 * filter and sort controls beside it, so the toolbar reads as one set of
 * controls rather than a native select dropped among them. The menu opens
 * below the trigger instead of over it, which keeps the year being left
 * behind visible while the next one is chosen. Newest first, because that is
 * the year being worked on.
 */
export function YearPicker({
  allLabel = "All",
  allowAll = false,
  ariaLabel = "Academic year",
  disabled = false,
  onChange,
  value,
  years,
}: {
  allLabel?: string;
  /** Offers an "all years" option after the individual years. */
  allowAll?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  onChange: (year: YearSelection) => void;
  value: YearSelection;
  years: number[];
}) {
  const [open, setOpen] = useState(false);
  const ordered = [...new Set(years)].sort((left, right) => right - left);
  const items = [
    ...ordered.map((year) => ({ value: String(year), label: String(year) })),
    ...(allowAll ? [{ value: "all", label: allLabel }] : []),
  ];
  const selected = value === "all" ? allLabel : String(value);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <MenuHint label={ariaLabel} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-label={`${ariaLabel}: ${selected}`}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <CalendarRange
              aria-hidden="true"
              className="text-muted-foreground/80"
              size={16}
            />
            <span className="font-medium tabular-nums">{selected}</span>
            {/* The chevron turns with the menu so the trigger shows its own
                state, rather than only the panel below reporting it. */}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "text-muted-foreground/80 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
              size={14}
            />
          </Button>
        </PopoverTrigger>
      </MenuHint>
      <PopoverContent
        align="start"
        className={cn(
          "min-w-(--radix-popover-trigger-width) p-1.5",
          items.length > SEARCHABLE_FROM ? "w-40" : "w-auto",
        )}
      >
        <OptionMenu
          emptyLabel="No years match."
          items={items}
          onSelect={(next) => {
            setOpen(false);
            onChange(next === "all" ? "all" : Number(next));
          }}
          searchPlaceholder={
            items.length > SEARCHABLE_FROM ? "Search years..." : undefined
          }
          value={String(value)}
        />
      </PopoverContent>
    </Popover>
  );
}
