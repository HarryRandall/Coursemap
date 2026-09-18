"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";

import {
  createElement,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Ban,
  BookOpen,
  ChartNoAxesColumn,
  FileText,
  Gauge,
  GraduationCap,
  GripVertical,
  KeyRound,
  Layers,
  SquareStack,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  conditionSummary,
  isConditionComplete,
  type ReviewedConditionKind,
  type ReviewedConditionNode,
  type ReviewedGroupNode,
  type ReviewedOperator,
} from "@/lib/coursemap/requisite-conditions";
import { ConditionInlineEditor } from "@/ui/admin/requisites/requisite-condition-fields";

const CONDITION_ICONS: Record<ReviewedConditionKind, LucideIcon> = {
  course: BookOpen,
  incompatible: Ban,
  structure: GraduationCap,
  units_total: Layers,
  subject_units: SquareStack,
  level_units: ChartNoAxesColumn,
  course_set_units: SquareStack,
  year_standing: GraduationCap,
  gpa: Gauge,
  wam: Gauge,
  permission: KeyRound,
  other: FileText,
};

/** Everything a single condition can do, wherever it is being shown. */
export type ConditionActions = {
  canNest: boolean;
  onAddCondition: (kind: ReviewedConditionKind) => void;
  onAddGroup: () => void;
  onChange: (next: ReviewedConditionNode) => void;
  onKindChange: (kind: ReviewedConditionKind) => void;
  onRemove: () => void;
};

export type ConditionDrag = {
  dragging: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function RemoveButton({
  className,
  label,
  onClick,
  variant = "danger",
}: {
  className?: string;
  label: string;
  onClick: () => void;
  variant?: "danger" | "muted";
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "grid size-9 shrink-0 cursor-pointer place-items-center rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
        variant === "danger"
          ? "text-rose-600 hover:bg-rose-50 hover:!text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/60 dark:hover:!text-rose-300"
          : "text-muted-foreground/80 hover:bg-rose-50 hover:!text-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/60 dark:hover:!text-rose-300",
        className,
      )}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      type="button"
    >
      {variant === "danger" ? (
        <Trash2 aria-hidden="true" size={16} />
      ) : (
        <X aria-hidden="true" size={18} />
      )}
    </button>
  );
}

export function operatorChipClass(operator: ReviewedOperator) {
  if (operator === "any_of") {
    return "border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 hover:border-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60";
  }
  if (operator === "at_least") {
    return "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 hover:border-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60";
  }
  return "border-primary/25 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15";
}

export function ConditionIcon({
  className,
  kind,
  size = 14,
}: {
  className?: string;
  kind: ReviewedConditionKind;
  size?: number;
}) {
  return createElement(CONDITION_ICONS[kind] ?? FileText, {
    "aria-hidden": "true",
    className,
    size,
  });
}

function DragHandle({
  className,
  drag,
  summary,
}: {
  className?: string;
  drag?: ConditionDrag;
  summary: string;
}) {
  if (!drag) return null;

  return (
    <button
      aria-label={`Drag condition: ${summary}`}
      aria-pressed={drag.dragging}
      className={cn(
        "grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/80 transition-colors outline-none select-none hover:bg-accent hover:text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/20 active:cursor-grabbing",
        className,
      )}
      onKeyDown={drag.onKeyDown}
      onPointerDown={drag.onPointerDown}
      title="Drag to move. Use Alt and the arrow keys to reorder."
      type="button"
    >
      <GripVertical aria-hidden="true" size={16} />
    </button>
  );
}

/** A stacked condition card with a dedicated Notion-style drag handle. */
export function ConditionChip({
  actions,
  canEdit,
  condition,
  drag,
}: {
  actions: ConditionActions;
  canEdit: boolean;
  condition: ReviewedConditionNode;
  drag?: ConditionDrag;
}) {
  const summary = conditionSummary(condition);
  const complete = isConditionComplete(condition);
  const shell = cn(
    "inline-flex min-h-10 w-full max-w-full items-start rounded-md border bg-card transition-colors shadow-xs",
    complete ? "border-border" : "border-amber-300 dark:border-amber-900",
    drag?.dragging && "opacity-40",
  );

  if (!canEdit) {
    return (
      <span className={cn(shell, "max-w-md gap-2 px-3 py-1.5 text-sm")}>
        <ConditionIcon
          className="shrink-0 opacity-70"
          kind={condition.kind}
          size={16}
        />
        <span className="leading-snug whitespace-normal">{summary}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative grid w-full max-w-full gap-1.5",
        drag?.dragging && "opacity-40",
      )}
      data-requisite-condition=""
    >
      <span className="hidden items-center justify-between gap-1 max-md:flex">
        <DragHandle className="size-11" drag={drag} summary={summary} />
        <RemoveButton
          className="size-11"
          label={`Remove condition: ${summary}`}
          onClick={actions.onRemove}
          variant="muted"
        />
      </span>
      <span className="flex min-w-0 items-start gap-1.5">
        <DragHandle
          className="mt-2 max-md:hidden"
          drag={drag}
          summary={summary}
        />
        <ConditionInlineEditor
          className={cn(
            "min-w-0 flex-1",
            complete
              ? "border-border"
              : "border-amber-300 dark:border-amber-900",
          )}
          condition={condition}
          layout="stacked"
          onChange={actions.onChange}
          onKindChange={actions.onKindChange}
        />
        <span className="mt-2 flex max-md:hidden">
          <RemoveButton
            label={`Remove condition: ${summary}`}
            onClick={actions.onRemove}
            variant="muted"
          />
        </span>
      </span>
    </span>
  );
}

/**
 * Choosing "at least N" needs the number as well as the operator, so the
 * counts are offered as menu items instead of a separate spin control.
 */
export function GroupOperatorMenu({
  children,
  group,
  onOperator,
  onRemove,
}: {
  children: ReactNode;
  group: ReviewedGroupNode;
  onOperator: (operator: ReviewedOperator, minimumCount?: number) => void;
  onRemove?: () => void;
}) {
  const current = group.minimumCount ?? 1;
  const counts = Array.from(
    { length: group.children.length },
    (_, index) => index + 1,
  );
  if (group.operator === "at_least" && !counts.includes(current)) {
    counts.push(current);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56 p-1.5">
        <DropdownMenuLabel>Join with</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(next) => {
            if (next.startsWith("at_least:")) {
              onOperator("at_least", Number(next.slice("at_least:".length)));
              return;
            }
            onOperator(next as ReviewedOperator);
          }}
          value={
            group.operator === "at_least"
              ? `at_least:${current}`
              : group.operator
          }
        >
          <DropdownMenuRadioItem value="all_of">And</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="any_of">Or</DropdownMenuRadioItem>
          {counts.length > 1
            ? counts.map((count) => (
                <DropdownMenuRadioItem key={count} value={`at_least:${count}`}>
                  At least {count}
                </DropdownMenuRadioItem>
              ))
            : null}
        </DropdownMenuRadioGroup>
        {onRemove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-600 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700 dark:text-rose-300 [&>svg]:text-rose-500"
              onSelect={onRemove}
            >
              <Trash2 aria-hidden="true" />
              Remove group
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * After the first condition, Add asks how the next item should join.
 */
export function AddJoinMenu({
  align = "start",
  canNest,
  children,
  onAnd,
  onNewSection,
  onOr,
}: {
  align?: "start" | "center" | "end";
  canNest: boolean;
  children: ReactNode;
  onAnd: () => void;
  onNewSection: () => void;
  onOr: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-52 p-1.5">
        <DropdownMenuItem onSelect={onAnd}>And</DropdownMenuItem>
        <DropdownMenuItem onSelect={onOr}>Or</DropdownMenuItem>
        <DropdownMenuItem disabled={!canNest} onSelect={onNewSection}>
          New section
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
