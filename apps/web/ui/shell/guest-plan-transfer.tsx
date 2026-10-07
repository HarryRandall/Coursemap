"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { showToast } from "@/ui/common/toast";
import {
  transferGuestPlan,
  type GuestPlanTransferChoice,
} from "@/lib/coursemap/guest-plan-transfer";

/**
 * Brings a plan made as a guest into the account just signed in to. A new
 * account takes it straight away; an account that already has a plan asks
 * first, so signing in never overwrites one silently.
 */
export function GuestPlanTransfer() {
  const router = useRouter();
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<GuestPlanTransferChoice | null>(null);
  const started = useRef(false);

  const run = useCallback(
    async (choice: GuestPlanTransferChoice) => {
      setPending(choice);
      try {
        const result = await transferGuestPlan(choice);
        if (result.status === "conflict") {
          setConflict(true);
          return;
        }
        if (result.status !== "failed") setConflict(false);
        if (result.status === "imported") showToast(result.message, "success");
        if (result.status === "failed") showToast(result.message, "error");
        router.refresh();
      } catch {
        showToast("Could not move your guest plan. Try again.", "error");
      } finally {
        setPending(null);
      }
    },
    [router],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run("if-empty");
  }, [run]);

  return (
    <Dialog
      open={conflict}
      // Dismissing leaves the guest plan in place to decide on next visit.
      onOpenChange={(open) => !open && !pending && setConflict(false)}
    >
      <DialogContent showCloseButton={false} className="max-w-md">
        <div className="space-y-2 p-5 sm:p-6">
          <DialogTitle className="text-lg font-semibold">
            Use the plan you made as a guest?
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            This account already has a plan. Replacing it moves your guest
            degree and courses in; results you have recorded stay either way.
          </DialogDescription>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-5 py-3.5 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => void run("discard")}
          >
            {pending === "discard" ? "Discarding…" : "Keep account plan"}
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void run("replace")}
          >
            {pending === "replace" ? "Moving plan…" : "Use guest plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
