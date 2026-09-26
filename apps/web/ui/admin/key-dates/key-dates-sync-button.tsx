"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import { syncKeyDatesAction } from "@/lib/admin/key-dates-actions";

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
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
        router.refresh();
      } catch {
        toast.error(`The ${year} calendar could not be synced. Try again.`);
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
