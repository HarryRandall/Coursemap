"use client";
import type { ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * Starts the entrance animations inside it (`enter-rise`, `enter-pop`,
 * `enter-grow-across`) when it scrolls into view.
 */
export function LandingReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={className} data-entered={inView || undefined}>
      {children}
    </div>
  );
}
