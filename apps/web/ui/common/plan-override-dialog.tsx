"use client";

import { useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { Input } from "@coursemap/ui/primitives/input";
import { OVERRIDE_REASONS } from "@/lib/coursemap/plan-overrides";
import type { OverrideReason, PlanOverride } from "@/lib/coursemap/types";
import type { CoursemapActionResult } from "@/lib/coursemap/actions";

export function PlanOverrideDialog({
  title,
  requirement = false,
  onClose,
  onSave,
}: {
  title: string;
  requirement?: boolean;
  onClose: () => void;
  onSave: (
    override: PlanOverride & { creditedUnits?: number },
  ) => Promise<CoursemapActionResult>;
}) {
  const [reason, setReason] = useState<OverrideReason>("approval");
  const [note, setNote] = useState("");
  const [units, setUnits] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await onSave({
        reason,
        ...(note ? { note } : {}),
        ...(requirement && units !== ""
          ? { creditedUnits: Number(units) }
          : {}),
      });
      if (result.ok) onClose();
      else setError(result.message);
    } catch {
      setError("Could not save the override. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {requirement
                ? "You can undo this any time. Only units you enter count towards totals."
                : "Your plan treats its requirements as met from here on. You can undo this any time."}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={pending} className="space-y-2">
            <legend className="sr-only">Reason</legend>
            {Object.entries(OVERRIDE_REASONS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value as OverrideReason)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-sm">
            Optional note
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              disabled={pending}
            />
          </label>
          {requirement ? (
            <label className="block space-y-1 text-sm">
              Units credited (optional)
              <Input
                type="number"
                min={0}
                max={2147483647}
                step={1}
                value={units}
                onChange={(event) => setUnits(event.target.value)}
                disabled={pending}
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
