import type { ReactNode } from "react";

/**
 * An empty state floating over a faded outline of what the page will hold,
 * so a student sees the page's shape around the prompt. The area is one
 * screen tall, so the prompt always sits in the middle of the page however
 * long the outline is. The outline is hidden from assistive technology and
 * cannot be focused.
 */
export function SkeletonBackdrop({
  backdrop,
  children,
}: {
  backdrop: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate h-[calc(100dvh-7rem)] min-h-[34rem] flex-1 overflow-hidden">
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none [mask-image:linear-gradient(to_bottom,black_30%,transparent)] opacity-40 select-none [&_*]:animate-none"
      >
        {backdrop}
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  );
}
