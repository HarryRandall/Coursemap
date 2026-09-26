import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { CompositionCourse } from "@/lib/coursemap/degree-composition";
import styles from "./composition-block.module.css";

const statusLabel = { completed: "Completed", planned: "Planned" } as const;

/** One course in an expanded composition block, or an empty place for one. */
export function CompositionSlot({
  course,
  href,
  emptyLabel,
  emptyUnits,
}: {
  course: CompositionCourse | null;
  href: string;
  /** Accessible name for an empty slot, naming where it leads. */
  emptyLabel: string;
  emptyUnits: number;
}) {
  if (!course) {
    return (
      <Link
        href={href}
        className={`${styles.slot} text-[10px] focus-visible:outline-2 focus-visible:outline-ring`}
        data-status="Unallocated"
        aria-label={emptyLabel}
      >
        <span className={styles.emptyLabel}>{emptyUnits} units</span>
        <Plus size={16} className={styles.addIcon} aria-hidden="true" />
      </Link>
    );
  }
  const status = statusLabel[course.status];
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={`${styles.slot} text-[10px] focus-visible:outline-2 focus-visible:outline-ring`}
          data-status={status}
          aria-label={`Open ${course.code} ${course.name} · ${status} · ${course.units} units`}
        >
          <span className={styles.code}>
            {course.code.replace(/\d/g, "")}
            <wbr />
            {course.code.replace(/\D/g, "")}
          </span>
          <ArrowUpRight
            size={12}
            className={styles.openIcon}
            aria-hidden="true"
          />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56">
        <span className="block font-medium">{course.name}</span>
        <span className="block opacity-80">
          {course.code} · {status} · {course.units} units
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
