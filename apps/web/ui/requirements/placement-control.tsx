"use client";

import { OptionPicker } from "@/ui/common/option-picker";
import type { TreeContext } from "./requirement-presentation";

const AUTOMATIC = "automatic";

/**
 * Where one course in the plan counts, and a way to move it to another part
 * of the degree it qualifies for. Coursemap's choice is the default; a
 * student's choice can be handed back to it.
 */
export function PlacementControl({
  courseCode,
  placement,
}: {
  courseCode: string;
  placement: NonNullable<TreeContext["placement"]>;
}) {
  const current = placement.allocation.get(courseCode);
  if (!current) return null;
  if (current.overCapKey) {
    return (
      <p className="text-xs text-destructive">
        Over the limit on {placement.labelFor(current.overCapKey).toLowerCase()}
        , so it counts towards nothing
      </p>
    );
  }
  const options = placement.optionsFor(courseCode);
  // A course already counting somewhere, such as a degree-wide rule with no
  // choice to offer, has nothing to move, so it shows nothing rather than
  // claiming it does not count.
  if (options.length === 0 && current.nodeKey) return null;
  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Doesn&apos;t count towards this degree
      </p>
    );
  }
  if (options.length === 1) return null;
  if (placement.readOnly) {
    return (
      <span className="text-xs text-muted-foreground">
        {current.nodeKey ? placement.labelFor(current.nodeKey) : "Nothing yet"}
      </span>
    );
  }
  const items = [
    ...options.map((option) => ({
      value: option.nodeKey,
      label: option.label,
    })),
    ...(current.pinned
      ? [{ value: AUTOMATIC, label: "Let Coursemap decide" }]
      : []),
  ];
  return (
    <OptionPicker
      aria-label={`Counts towards for ${courseCode}`}
      variant="ghost"
      triggerLabel={`Counts towards: ${current.nodeKey ? placement.labelFor(current.nodeKey).split(" · ").slice(1).join(" · ") || placement.labelFor(current.nodeKey) : "Nothing yet"}`}
      title={
        current.pinned ? "You chose where this course counts" : "Counts towards"
      }
      className="relative z-10 h-7 min-w-0 gap-1 px-2 text-xs"
      items={items}
      size="sm"
      value={current.nodeKey ?? ""}
      placeholder="Nothing yet"
      onValueChange={(next) =>
        placement.onPlace(courseCode, next === AUTOMATIC ? null : next)
      }
    />
  );
}
