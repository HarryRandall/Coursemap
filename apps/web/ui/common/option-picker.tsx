"use client";

import { useState, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import { OptionMenu, type OptionMenuItem } from "@/ui/common/option-menu";
import { cn } from "@/lib/cn";

/** Coursemap's single-value picker, composed from the shared filter menu. */
export function OptionPicker({
  items,
  value,
  onValueChange,
  open: controlledOpen,
  onOpenChange,
  searchable = "auto",
  placeholder = "Select...",
  className,
  disabled,
  ...triggerProps
}: Omit<ComponentProps<typeof Button>, "value" | "onChange" | "children"> & {
  items: OptionMenuItem<string>[];
  value: string;
  onValueChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Auto enables search for more than eight options. Years pass false. */
  searchable?: boolean | "auto";
  placeholder?: string;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const selected = items.find((item) => item.value === value);
  const showSearch = searchable === "auto" ? items.length > 8 : searchable;
  function changeOpen(next: boolean) {
    setLocalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          {...triggerProps}
          data-slot="option-picker-trigger"
          type="button"
          variant="outline"
          className={cn("w-fit max-w-full justify-between", className)}
          disabled={disabled || items.length === 0}
        >
          <span className="min-w-0 truncate text-left">
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown aria-hidden="true" className="shrink-0" size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 max-w-(--radix-popover-content-available-width) min-w-(--radix-popover-trigger-width) p-1.5"
      >
        <OptionMenu
          items={items}
          value={value}
          searchPlaceholder={showSearch ? "Search options..." : undefined}
          onSelect={(next) => {
            changeOpen(false);
            if (next !== value) onValueChange(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
