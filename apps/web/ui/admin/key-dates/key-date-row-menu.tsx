"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import {
  removeKeyDateAction,
  reviseKeyDatesReviewAction,
} from "@/lib/admin/key-dates-actions";
import type { UniversityCalendarReviewEvent } from "@/lib/coursemap/university-calendar-review";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { KeyDateDialog } from "@/ui/admin/key-dates/key-date-dialog";
import { calendarDateLabel } from "@/ui/key-dates/category-badge";

/**
 * Edit and remove for one row. A published date is changed directly; a date
 * that only exists in the sync under review (`reviewId`) is corrected or left
 * out of that sync instead.
 */
export function KeyDateRowMenu({
  event,
  reviewId,
  year,
}: {
  event: UniversityCalendarReviewEvent;
  reviewId?: string;
  year: number;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const staged = event.eventId === undefined;
  if (staged && !reviewId) return null;
  const day = calendarDateLabel(event.date, { day: "numeric", month: "long" });

  async function remove() {
    const result = staged
      ? await reviseKeyDatesReviewAction(reviewId!, year, event, null)
      : await removeKeyDateAction(year, event.eventId!);
    if (!result.ok) throw new Error(result.message);
    toast.success(result.message);
    router.refresh();
  }

  return (
    <>
      {/* Not modal, so the list keeps scrolling while the menu is open. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${event.title} options`}
            className="text-muted-foreground"
            ref={trigger}
            size="icon-sm"
            variant="ghost"
          >
            <EllipsisVertical aria-hidden="true" size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" hideWhenDetached>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive data-[highlighted]:text-destructive"
            onSelect={() => setRemoving(true)}
          >
            <Trash2 aria-hidden="true" />
            {staged ? "Leave out" : "Remove"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <KeyDateDialog
        entry={{ id: event.eventId, date: event.date, title: event.title }}
        hint={
          staged
            ? "Your correction is published with this sync and kept by later syncs."
            : undefined
        }
        onOpenChange={setEditing}
        onSave={
          staged
            ? (draft) =>
                reviseKeyDatesReviewAction(reviewId!, year, event, {
                  date: draft.date,
                  title: draft.title,
                })
            : undefined
        }
        open={editing}
        year={year}
      />
      <ConfirmDialog
        confirmLabel={staged ? "Leave out" : "Remove"}
        description={
          staged
            ? `"${event.title}" on ${day} will not be published with this sync.`
            : `Students stop seeing "${event.title}" on ${day}.`
        }
        destructive
        onConfirm={remove}
        onOpenChange={setRemoving}
        open={removing}
        returnFocusRef={trigger}
        title={staged ? "Leave this date out?" : "Remove this key date?"}
      />
    </>
  );
}
