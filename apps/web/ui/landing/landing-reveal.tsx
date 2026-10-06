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
  immediate = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Plays straight away, from the server's HTML, rather than waiting for
   * the page's script. For content on screen as the page opens.
   */
  immediate?: boolean;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      data-entered={immediate || inView || undefined}
    >
      {children}
    </div>
  );
}
