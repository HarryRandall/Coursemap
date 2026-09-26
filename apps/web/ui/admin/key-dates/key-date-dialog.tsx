"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@coursemap/ui/primitives/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";
import { saveKeyDateAction } from "@/lib/admin/key-dates-actions";

export type KeyDateDraft = { id?: number; date: string; title: string };

/**
 * Adds a key date or edits a published one. Saved dates are marked as
 * entered by hand, which keeps later ANU syncs from removing them.
 */
export function KeyDateDialog({
  entry,
  onOpenChange,
  open,
  trigger,
  year,
}: {
  entry?: KeyDateDraft;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
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
  const editing = entry?.id !== undefined;

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
    setPending(true);
    setError(null);
    try {
      const result = await saveKeyDateAction(year, {
        id: entry?.id,
        date,
        title,
      });
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
      <DialogContent className="max-w-md">
        <form className="contents" onSubmit={submit}>
          <DialogHeader className="px-5 pt-5 pr-16">
            <DialogTitle>
              {editing ? "Edit key date" : "Add a key date"}
            </DialogTitle>
            <DialogDescription>
              Dates saved here stay published when the ANU calendar is synced
              again.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="px-5 py-4">
            <Field>
              <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
              <Input
                id={`${id}-date`}
                max={`${year}-12-31`}
                min={`${year}-01-01`}
                onChange={(event) => setDate(event.target.value)}
                required
                type="date"
                value={date}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
              <Input
                id={`${id}-title`}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Semester 1 census date"
                required
                value={title}
              />
              <FieldDescription>
                The category is worked out from the title, as for synced dates.
              </FieldDescription>
            </Field>
            {error ? <FieldError role="alert">{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? "Saving..." : editing ? "Save changes" : "Add date"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
