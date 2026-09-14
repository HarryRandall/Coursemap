"use client";

import { Badge } from "@coursemap/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";

export function CourseAvailability({
  courseCode,
  sessions,
}: {
  courseCode: string;
  sessions: readonly string[];
}) {
  const labels = [...new Set(sessions)].sort();
  const remaining = labels.length - 2;

  if (labels.length === 0) {
    return (
      <span className="text-[13px] text-muted-foreground/80">Not listed</span>
    );
  }

  return (
    <div className="flex min-h-10 flex-col justify-center gap-1">
      {labels.slice(0, 2).map((label, index) => (
        <div key={label} className="flex min-w-0 items-center gap-1">
          <Badge variant="outline" className="max-w-full">
            <span className="truncate" title={label}>
              {label}
            </span>
          </Badge>
          {index === 1 && remaining > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge asChild variant="outline">
                  <button
                    type="button"
                    className="cursor-default hover:bg-accent hover:text-accent-foreground"
                    aria-label={`Show ${remaining} more available study periods for ${courseCode}`}
                  >
                    +{remaining}
                  </button>
                </Badge>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                collisionPadding={8}
                className="w-max max-w-[calc(100vw-2rem)]"
              >
                <ul className="space-y-1">
                  {labels.slice(2).map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ))}
    </div>
  );
}
