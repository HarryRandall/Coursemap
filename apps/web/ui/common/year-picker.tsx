"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@coursemap/ui/primitives/select";

export type YearSelection = number | "all";

/**
 * One academic year. This is a native-feeling select rather than the option
 * picker: the values are a handful of four-digit years, and a searchable
 * popover list drawn below the trigger read as a heavy component for choosing
 * a single number. The select opens with the current year aligned over the
 * trigger, so a change is one short movement. Newest first, because that is
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
  const ordered = [...new Set(years)].sort((left, right) => right - left);
  return (
    <Select
      disabled={disabled}
      value={String(value)}
      onValueChange={(next) => onChange(next === "all" ? "all" : Number(next))}
    >
      <SelectTrigger aria-label={ariaLabel} size="sm" className="tabular-nums">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ordered.map((year) => (
          <SelectItem key={year} value={String(year)} className="tabular-nums">
            {year}
          </SelectItem>
        ))}
        {allowAll ? <SelectItem value="all">{allLabel}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}
