"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Calendar } from "@coursemap/ui/primitives/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import { cn } from "@/lib/cn";

/** Parses an ISO day as a local date, so the picker never shifts it a day. */
function fromIsoDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : undefined;
}

function toIsoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const labelFormat = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * One calendar day as an ISO string (YYYY-MM-DD). `min` and `max` bound both
 * the selectable days and the months the calendar can page through.
 */
export function DatePicker({
  className,
  id,
  max,
  min,
  onChange,
  placeholder = "Choose a date",
  value,
}: {
  className?: string;
  id?: string;
  max?: string;
  min?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromIsoDay(value);
  const start = min ? fromIsoDay(min) : undefined;
  const end = max ? fromIsoDay(max) : undefined;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "w-full justify-start font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
          id={id}
          type="button"
          variant="outline"
        >
          <CalendarDays
            aria-hidden="true"
            className="text-muted-foreground"
            size={15}
          />
          <span className="flex-1 text-left">
            {selected ? labelFormat.format(selected) : placeholder}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground"
            size={14}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          defaultMonth={selected ?? start}
          disabled={[
            ...(start ? [{ before: start }] : []),
            ...(end ? [{ after: end }] : []),
          ]}
          endMonth={end}
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            onChange(toIsoDay(date));
            setOpen(false);
          }}
          selected={selected}
          startMonth={start}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
}
