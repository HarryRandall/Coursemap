"use client";
import Link from "next/link";
import {
  ArrowRightLeft,
  BookOpen,
  ExternalLink,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import { sessionShortName } from "@/lib/coursemap/academic-periods";
import type { Course, Term } from "@/lib/coursemap/types";

/**
 * Everything a planned course can do without dragging: open it, move it to
 * another semester it runs in, or take it out of the plan.
 */
export function PlanRowMenu({
  course,
  moveTargets,
  coursePageHref,
  onOpen,
  onMove,
  onRemove,
}: {
  course: Pick<Course, "code" | "name">;
  /** Semesters the course runs in, other than the one it is in. */
  moveTargets: readonly Term[];
  /** The course page, when one exists for the planned year. */
  coursePageHref: string | null;
  onOpen: () => void;
  onMove: (termId: string) => void;
  onRemove?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More for ${course.code}`}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-60 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[state=open]:bg-muted data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onOpen}>
          <BookOpen aria-hidden="true" />
          Course details
        </DropdownMenuItem>
        {coursePageHref ? (
          <DropdownMenuItem asChild>
            <Link href={coursePageHref}>
              <ExternalLink aria-hidden="true" />
              Open course page
            </Link>
          </DropdownMenuItem>
        ) : null}
        {moveTargets.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft aria-hidden="true" />
              Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {moveTargets.map((term) => (
                <DropdownMenuItem
                  key={term.id}
                  onSelect={() => onMove(term.id)}
                >
                  {`${sessionShortName(term.name)} ${term.year}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {onRemove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 aria-hidden="true" />
              Remove from plan
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
