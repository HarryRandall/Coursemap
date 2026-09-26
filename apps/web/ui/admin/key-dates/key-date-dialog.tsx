"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@coursemap/ui/primitives/dialog";
import { Input } from "@coursemap/ui/primitives/input";
import { Label } from "@coursemap/ui/primitives/label";
import {
  saveKeyDateAction,
  type KeyDatesActionResult,
} from "@/lib/admin/key-dates-actions";
import { DatePicker } from "@/ui/common/date-picker";
import { Hint } from "@/ui/common/hint";

export type KeyDateDraft = { id?: number; date: string; title: string };

function InfoHint({ label }: { label: string }) {
  return (
    <Hint label={label}>
      <button
        aria-label={label}
        className="inline-grid size-5 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
      >
        <Info aria-hidden="true" size={14} />
      </button>
    </Hint>
  );
}

/**
 * Adds or edits one key date. By default it saves to the published dates,
 * which marks the date manual so later ANU syncs keep it; `onSave` redirects
 * the save, for example into a sync that is still under review.
 */
export function KeyDateDialog({
  entry,
  hint = "Dates saved here stay published when the ANU calendar is synced again.",
  onOpenChange,
  onSave,
  open,
  title: dialogTitle,
  trigger,
  year,
}: {
  entry?: KeyDateDraft;
  hint?: string;
  onOpenChange?: (open: boolean) => void;
  onSave?: (draft: KeyDateDraft) => Promise<KeyDatesActionResult>;
  open?: boolean;
  title?: string;
  trigger?: ReactNode;
  year: number;
}) {
  const router = useRouter();
  const id = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const [date, setDate] = useState(entry?.date ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resolvedOpen = open ?? internalOpen;
  const editing = entry !== undefined;

  function changeOpen(next: boolean) {
    if (next) {
      setDate(entry?.date ?? "");
      setTitle(entry?.title ?? "");
      setError(null);
    }
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date) {
      setError(`Choose a date in ${year}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const draft = { id: entry?.id, date, title };
      const result = onSave
        ? await onSave(draft)
        : await saveKeyDateAction(year, draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(result.message);
      changeOpen(false);
      router.refresh();
    } catch {
      setError("The key date could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={changeOpen} open={resolvedOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {dialogTitle ?? (editing ? "Edit key date" : "Add a key date")}
              <InfoHint label={hint} />
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1" htmlFor={`${id}-title`}>
              Title
              <InfoHint label="The category is chosen from the title, the same way as for synced dates." />
            </Label>
            <Input
              autoFocus
              id={`${id}-title`}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Semester 1 census date"
              required
              value={title}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-date`}>Date</Label>
            <DatePicker
              id={`${id}-date`}
              max={`${year}-12-31`}
              min={`${year}-01-01`}
              onChange={setDate}
              value={date}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? "Saving..." : editing ? "Save" : "Add date"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
