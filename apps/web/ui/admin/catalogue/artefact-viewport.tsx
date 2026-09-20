"use client";

import type { ReactNode } from "react";

export function ArtefactViewport({
  children,
  label,
  toolbar,
}: {
  children: ReactNode;
  label: string;
  toolbar?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {toolbar ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border p-3">
          {toolbar}
        </div>
      ) : null}
      <div
        aria-label={label}
        role="region"
        tabIndex={0}
        className="h-[32rem] overflow-auto overscroll-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset md:h-auto md:min-h-0 md:flex-1"
      >
        {children}
      </div>
    </div>
  );
}
