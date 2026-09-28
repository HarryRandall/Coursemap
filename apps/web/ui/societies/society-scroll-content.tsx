"use client";

import { useState, type ReactNode } from "react";

/** Soften the edge beneath the tabs once content has scrolled out of view. */
export function SocietyScrollContent({ children }: { children: ReactNode }) {
  const [fadeDistance, setFadeDistance] = useState(0);
  return (
    <div
      className="workspace-scroll flex flex-col"
      onScroll={(event) =>
        setFadeDistance(
          Math.min(24, Math.max(0, event.currentTarget.scrollTop)),
        )
      }
      style={{
        scrollPaddingTop: "24px",
        maskImage:
          fadeDistance > 0
            ? `linear-gradient(to bottom, rgb(0 0 0 / ${1 - fadeDistance / 24}), black 24px)`
            : undefined,
      }}
    >
      {children}
    </div>
  );
}
