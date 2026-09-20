"use client";

import { OptionPicker } from "@/ui/common/option-picker";

export type YearSelection = number | "all";

/**
 * One academic year. The values are four digits, so the picker is compact:
 * a full-width menu of generously spaced rows read as a heavy component for
 * a single number. Newest first, because that is the year being worked on.
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
    <OptionPicker
      aria-label={ariaLabel}
      className="tabular-nums"
      compact
      disabled={disabled}
      searchable={false}
      size="sm"
      value={String(value)}
      items={[
        ...ordered.map((year) => ({
          value: String(year),
          label: String(year),
        })),
        ...(allowAll ? [{ value: "all", label: allLabel }] : []),
      ]}
      onValueChange={(next) => onChange(next === "all" ? "all" : Number(next))}
    />
  );
}
