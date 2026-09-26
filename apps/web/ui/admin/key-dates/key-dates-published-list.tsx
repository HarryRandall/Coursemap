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
import { removeKeyDateAction } from "@/lib/admin/key-dates-actions";
import type { UniversityCalendarReviewEvent } from "@/lib/coursemap/university-calendar-review";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { KeyDateDialog } from "@/ui/admin/key-dates/key-date-dialog";
import { KeyDatesMonthList } from "@/ui/admin/key-dates/key-dates-month-list";
import { calendarDateLabel } from "@/ui/key-dates/category-badge";

function KeyDateRowMenu({
  event,
  year,
}: {
  event: UniversityCalendarReviewEvent & { eventId: number };
  year: number;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const label = `${event.title} options`;

  async function remove() {
    const result = await removeKeyDateAction(year, event.eventId);
    if (!result.ok) throw new Error(result.message);
    toast.success(result.message);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={label}
            ref={trigger}
            size="icon-sm"
            variant="ghost"
          >
            <EllipsisVertical aria-hidden="true" size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <KeyDateDialog
        entry={{ id: event.eventId, date: event.date, title: event.title }}
        onOpenChange={setEditing}
        open={editing}
        year={year}
      />
      <ConfirmDialog
        confirmLabel="Remove"
        description={`Students stop seeing "${event.title}" on ${calendarDateLabel(event.date, { day: "numeric", month: "long" })}. ${
          event.manual
            ? "It will not come back unless it is added again."
            : "A later sync that still lists it will offer to add it back."
        }`}
        destructive
        onConfirm={remove}
        onOpenChange={setRemoving}
        open={removing}
        returnFocusRef={trigger}
        title="Remove this key date?"
      />
    </>
  );
}

/** The dates students see for the year, each with edit and remove actions. */
export function KeyDatesPublishedList({
  canManage,
  events,
  year,
}: {
  canManage: boolean;
  events: UniversityCalendarReviewEvent[];
  year: number;
}) {
  return (
    <KeyDatesMonthList
      actions={
        canManage
          ? (event) =>
              event.eventId !== undefined ? (
                <KeyDateRowMenu
                  event={{ ...event, eventId: event.eventId }}
                  year={year}
                />
              ) : null
          : undefined
      }
      events={events}
    />
  );
}
