"use client";
import { useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import { useCoursemap } from "@/app/providers";
import { cn } from "@/lib/cn";
import { OVERRIDE_REASONS } from "@/lib/coursemap/plan-overrides";
import type { OverrideReason } from "@/lib/coursemap/types";

const REASONS = Object.entries(OVERRIDE_REASONS) as Array<
  [OverrideReason, string]
>;

/**
 * Keeping a course where it is despite what blocks it: the student says why,
 * and the plan treats its requirements as met from then on.
 */
export function TakeAnywayForm({
  courseCode,
  onDone,
}: {
  courseCode: string;
  onDone: () => void;
}) {
  const { bypassCourse, notify } = useCoursemap();
  const [reason, setReason] = useState<OverrideReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      const result = await bypassCourse(courseCode, {
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      notify(result.message, result.ok ? "success" : "error");
      if (result.ok) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-xs font-medium text-foreground">Take it anyway</p>
        <p className="text-[11px] text-muted-foreground">
          Your plan treats its requirements as met. You can undo this from the
          course menu.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={`Why you can take ${courseCode}`}
        className="flex flex-wrap gap-1.5"
      >
        {REASONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={reason === value}
            onClick={() => setReason(value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition",
              reason === value
                ? "bg-primary/10 text-primary ring-primary/50"
                : "text-muted-foreground ring-border hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {reason ? (
        <div className="flex items-center gap-2">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            placeholder="Add a note (optional)"
            aria-label="Note"
            className="h-8 flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? (
              <LoaderCircle
                size={14}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck size={14} aria-hidden="true" />
            )}
            Take it anyway
          </Button>
        </div>
      ) : null}
    </div>
  );
}
