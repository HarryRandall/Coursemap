import type { ReactNode } from "react";

/**
 * An empty state floating over a faded outline of what the page will hold,
 * so a student sees the page's shape around the prompt. The area is one
 * screen tall, so the prompt always sits in the middle of the page however
 * long the outline is. The outline is hidden from assistive technology and
 * cannot be focused.
 *
 * The height must not flex: a zero flex basis on a page without a fixed
 * height falls back to the outline's full length and pushes the prompt
 * below the fold. Desktop subtracts a further 1rem for the inset margins.
 */
export function SkeletonBackdrop({
  backdrop,
  children,
}: {
  backdrop: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate h-[calc(100dvh-7rem)] min-h-[34rem] flex-none overflow-hidden md:h-[calc(100dvh-8rem)]">
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
