"use client";

import { useState, type ComponentProps, type ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";

/**
 * Hint for a control that also opens a menu.
 *
 * A plain tooltip wrapped around a menu trigger sticks open once the menu has
 * been used: closing the menu restores focus to the trigger, and a focus that
 * did not follow a pointer press re-opens the tooltip with no pointer left over
 * the control to dismiss it again.
 *
 * So the hint stays closed while the menu is open, and afterwards only a
 * pointer actually over the control, or a real keyboard focus ring, brings it
 * back. The control keeps its aria-label either way, so nothing is lost when
 * the hint is suppressed.
 */
export function MenuHint({
  label,
  open,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  /** Whether the menu this control opens is currently showing. */
  open: boolean;
  children: ReactElement;
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
}) {
  const [hinted, setHinted] = useState(false);
  return (
    <Tooltip open={!open && hinted}>
      <TooltipTrigger
        asChild
        onPointerEnter={() => setHinted(true)}
        onPointerLeave={() => setHinted(false)}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setHinted(true);
        }}
        onBlur={() => setHinted(false)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent align={align} side={side}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
