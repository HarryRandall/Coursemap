"use client";
import { Star } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import { useCoursemap } from "@/app/providers";

/** Stars a course to come back to while planning, or unstars it. */
export function StarButton({
  courseCode,
  className,
}: {
  courseCode: string;
  className?: string;
}) {
  const { state, toggleStar, notify } = useCoursemap();
  const starred = (state.starredCourses ?? []).includes(courseCode);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${courseCode}` : `Star ${courseCode}`}
      title={starred ? "Unstar" : "Star to consider later"}
      className={cn("shrink-0", className)}
      onClick={async () => {
        const result = await toggleStar(courseCode);
        if (!result.ok) notify(result.message, "warning");
      }}
    >
      <Star
        size={14}
        aria-hidden="true"
        className={cn(starred && "fill-amber-400 text-amber-500")}
      />
    </Button>
  );
}
