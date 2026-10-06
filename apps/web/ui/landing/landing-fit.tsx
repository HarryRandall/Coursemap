"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Fit = { scale: number; width: number | null; offset: number };

/**
 * Shrinks its content to fit the box it is given instead of scrolling or
 * clipping, so a tall or wide example still shows whole. Content that
 * already fits keeps its size. `minWidth` lays the content out at least that
 * wide, for content with a fixed natural width such as a diagram.
 * Decorative surfaces only: scaled text is harder to read.
 */
export function LandingFit({
  children,
  className,
  minWidth = 0,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, width: null, offset: 0 });
  useEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const measure = () => {
      const boxWidth = box.clientWidth;
      const width = Math.max(boxWidth, minWidth);
      const scale = Math.min(
        1,
        boxWidth / Math.max(1, width),
        box.clientHeight / Math.max(1, content.scrollHeight),
      );
      // Centred across the box when the height is what limits the size.
      const offset = Math.max(0, (boxWidth - width * scale) / 2);
      setFit((current) =>
        current.scale === scale &&
        current.width === width &&
        current.offset === offset
          ? current
          : { scale, width, offset },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [minWidth]);
  return (
    <div ref={outer} className={className} style={{ overflow: "hidden" }}>
      <div
        ref={inner}
        className="origin-top-left transition-transform duration-300"
        style={{
          width: fit.width ?? "100%",
          transform: `translateX(${fit.offset}px) scale(${fit.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
