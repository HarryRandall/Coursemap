import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

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
 *
 * With `fill`, the area instead takes the rest of a flex column with a
 * definite height, such as a tab panel below a header. The outline is
 * clipped to that area and never grows it, while the prompt stays in flow
 * so the area is never shorter than the prompt.
 */
export function SkeletonBackdrop({
  backdrop,
  fill = false,
  children,
}: {
  backdrop: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative isolate",
        fill
          ? "flex flex-1 flex-col max-md:min-h-[34rem]"
          : "h-[calc(100dvh-7rem)] min-h-[34rem] flex-none overflow-hidden md:h-[calc(100dvh-8rem)]",
      )}
    >
      <div
        aria-hidden="true"
        inert
        className={cn(
          "pointer-events-none [mask-image:linear-gradient(to_bottom,black_30%,transparent)] opacity-40 select-none [&_*]:animate-none",
          fill && "absolute inset-0 -z-10 overflow-hidden",
        )}
      >
        {backdrop}
      </div>
      <div
        className={cn(
          "flex items-center justify-center px-4",
          fill ? "flex-1" : "absolute inset-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
