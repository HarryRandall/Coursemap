"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import { syncKeyDatesAction } from "@/lib/admin/key-dates-actions";
import { showToast } from "@/ui/common/toast";

/** Fetches the year from the ANU calendar and stages it for review. */
export function KeyDatesSyncButton({
  label = "Sync from ANU",
  variant = "default",
  year,
}: {
  label?: string;
  variant?: "default" | "outline";
  year: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      try {
        const result = await syncKeyDatesAction(year);
        if (result.ok) showToast(result.message);
        else showToast(result.message, "error");
        if (result.staged)
          router.push(`/admin/key-dates/${year}/sync`, { scroll: false });
      } catch {
        showToast(`Couldn't sync the ${year} calendar. Try again.`, "error");
      }
    });
  }

  return (
    <Button disabled={pending} onClick={sync} type="button" variant={variant}>
      <RefreshCw
        aria-hidden="true"
        className={cn(pending && "motion-safe:animate-spin")}
        size={15}
      />
      {pending ? "Syncing..." : label}
    </Button>
  );
}
