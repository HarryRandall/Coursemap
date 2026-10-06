"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shrinks its content to fit the height it is given instead of scrolling,
 * so a tall example still shows whole. Content that already fits keeps its
 * size. Decorative surfaces only: scaled text is harder to read.
 */
export function LandingFit({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const observer = new ResizeObserver(() => {
      const fits = box.clientHeight / Math.max(1, content.scrollHeight);
      setScale(Math.min(1, fits));
    });
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} className={className} style={{ overflow: "hidden" }}>
      <div
        ref={inner}
        className="origin-top transition-transform duration-300"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
