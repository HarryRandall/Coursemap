"use client";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";

import { useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
} from "lucide-react";

import { MenuHint } from "@/ui/common/menu-hint";
import { OptionMenu } from "@/ui/common/option-menu";

export type SortOption<T extends string> = {
  value: T;
  label: string;
  /** Renders the descending icon while this option is the active order. */
  descending?: boolean;
};

/**
 * Ordering menu for a directory table. It reuses the filter menu's list
 * primitives so the two controls that sit side by side behave and read the
 * same way rather than as two separate inventions.
 */
export function SortMenu<T extends string>({
  defaultValue,
  onChange,
  options,
  value,
}: {
  /** The order the table falls back to; the trigger stays neutral on it. */
  defaultValue: T;
  onChange: (value: T) => void;
  options: SortOption<T>[];
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  const sorted = value !== defaultValue;
  const label = current ? `Sort: ${current.label}` : "Sort";
  const Icon = !sorted
    ? ArrowUpDown
    : current?.descending
      ? ArrowDownWideNarrow
      : ArrowUpNarrowWide;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <MenuHint label={label} open={open}>
        <PopoverTrigger asChild>
          {/* The box stays outlined in every state, like the filter beside it;
              the icon alone carries whether an order is applied. */}
          <Button
            aria-label={label}
            aria-pressed={sorted}
            className="size-10 shrink-0 aria-pressed:bg-muted aria-pressed:text-foreground"
            size="icon"
            variant="outline"
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
          </Button>
        </PopoverTrigger>
      </MenuHint>
      <PopoverContent align="end" className="w-56 p-1.5">
        <OptionMenu
          items={options.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onSelect={(next) => {
            setOpen(false);
            onChange(next);
          }}
          value={value}
        />
      </PopoverContent>
    </Popover>
  );
}
