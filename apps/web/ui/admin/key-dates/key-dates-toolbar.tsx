"use client";

import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { Button, buttonVariants } from "@coursemap/ui/primitives/button";
import {
  keyDatesPath,
  keyDatesSectionFromPath,
} from "@/lib/admin/key-dates-sections";
import { YearPicker } from "@/ui/common/year-picker";
import { KeyDateDialog } from "@/ui/admin/key-dates/key-date-dialog";
import { KeyDatesSyncButton } from "@/ui/admin/key-dates/key-dates-sync-button";

/**
 * The year picker and the open section's actions. It lives in the layout,
 * so switching sections never reloads it.
 */
export function KeyDatesToolbar({
  canManage,
  hasPublished,
  hasReview,
  sourceUrl,
  year,
  years,
}: {
  canManage: boolean;
  hasPublished: boolean;
  hasReview: boolean;
  sourceUrl: string;
  year: number;
  years: number[];
}) {
  const router = useRouter();
  const section = keyDatesSectionFromPath(usePathname());

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <YearPicker
        ariaLabel="Calendar year"
        onChange={(next) => {
          if (next !== "all")
            router.push(keyDatesPath(next, section), { scroll: false });
        }}
        value={year}
        years={years}
      />
      <div className="flex flex-wrap gap-2">
        <a
          className={buttonVariants({ variant: "ghost" })}
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          ANU calendar
          <ExternalLink aria-hidden="true" size={14} />
        </a>
        {canManage && section === "dates" && hasPublished ? (
          <KeyDateDialog
            trigger={
              <Button type="button" variant="outline">
                <Plus aria-hidden="true" size={15} />
                Add date
              </Button>
            }
            year={year}
          />
        ) : null}
        {canManage && section === "sync" && hasReview ? (
          <KeyDatesSyncButton
            label="Sync again"
            variant="outline"
            year={year}
          />
        ) : null}
      </div>
    </div>
  );
}
