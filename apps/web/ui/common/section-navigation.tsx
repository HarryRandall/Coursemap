"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Links to the sections of a long page: a column beside the content on wide
 * screens and a strip above it on narrow ones. The section in view is marked
 * so a reader keeps their place while scrolling.
 */
export function SectionNavigation({
  sections,
  label = "On this page",
  className,
}: {
  sections: { id: string; label: string }[];
  label?: string;
  className?: string;
}) {
  const ids = sections.map((section) => section.id).join("|");
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    // jsdom has no IntersectionObserver; the links work without the marker.
    if (typeof IntersectionObserver === "undefined") return;
    const elements = ids
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      // A section counts as in view once its top crosses the upper third.
      { rootMargin: "0px 0px -66% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids]);
  const current = active ?? sections[0]?.id ?? null;
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex shrink-0 gap-1 overflow-x-auto border-b border-border pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-b-0 lg:border-l lg:pb-0",
        className,
      )}
    >
      {sections.map((section) => {
        const isCurrent = section.id === current;
        return (
          <Link
            key={section.id}
            href={`#${section.id}`}
            prefetch={false}
            aria-current={isCurrent ? "location" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none lg:-ml-px lg:rounded-none lg:border-l-2 lg:border-transparent",
              isCurrent
                ? "font-medium text-foreground lg:border-primary"
                : "text-muted-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
