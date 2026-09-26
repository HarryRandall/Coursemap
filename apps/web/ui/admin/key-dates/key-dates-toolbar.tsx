"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { YearPicker } from "@/ui/common/year-picker";
import {
  keyDatesPath,
  type KeyDatesSection,
} from "@/lib/admin/key-dates-sections";

/** The year being managed, its state and the section's actions. */
export function KeyDatesToolbar({
  actions,
  section,
  status,
  year,
  years,
}: {
  actions?: ReactNode;
  section: KeyDatesSection;
  status: ReactNode;
  year: number;
  years: number[];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <YearPicker
          ariaLabel="Calendar year"
          onChange={(next) => {
            if (next !== "all")
              router.push(keyDatesPath(next, section), { scroll: false });
          }}
          value={year}
          years={years}
        />
        <div className="min-w-0 text-sm text-muted-foreground">{status}</div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
