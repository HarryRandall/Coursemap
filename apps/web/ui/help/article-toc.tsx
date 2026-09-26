"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { scrollParent } from "@/lib/scroll-parent";

export type ArticleTocItem = {
  id: string;
  label: string;
};

/**
 * Notion-style "on this page" list that highlights the section
 * currently in view as the reader scrolls.
 */
export function ArticleToc({ items }: { items: ArticleTocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      // The active section is the last one whose top has crossed the
      // reading line, a quarter of the way down the viewport.
      const line = window.innerHeight * 0.25;
      let current: string | null = items[0]?.id ?? null;
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= line) {
          current = item.id;
        }
      }
      const first = items[0] && document.getElementById(items[0].id);
      const scroller = scrollParent(first ?? null);
      const atPageEnd =
        scroller.scrollHeight > scroller.clientHeight &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      const lastSection = items.at(-1);
      if (atPageEnd && lastSection) current = lastSection.id;
      setActiveId(current);
    };

    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    // Scroll events do not bubble, so listen in the capture phase to hear the
    // content panel as well as the document.
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  const scrollToSection = (
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    const element = document.getElementById(id);
    if (!element) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    window.history.pushState(null, "", `#${id}`);
    setActiveId(id);
  };

  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        On this page
      </p>
      <ul className="mt-3 border-l border-border">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(event) => scrollToSection(event, item.id)}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pr-2 pl-4 text-[13px] leading-snug transition-colors",
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:border-input hover:text-foreground/90",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
