import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ChartColumn,
  CircleCheck,
  GitCompare,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AttentionQueue } from "@/lib/admin/dashboard";

const ICONS: Record<string, LucideIcon> = {
  failed: AlertTriangle,
  review: GitCompare,
  "key-dates": CalendarClock,
  "selt-ready": ChartColumn,
  "selt-blocked": ChartColumn,
  active: RefreshCw,
};

const TONES = {
  critical: { bar: "bg-destructive", icon: "text-destructive" },
  warning: { bar: "bg-warning", icon: "text-warning" },
  neutral: { bar: "bg-muted-foreground/60", icon: "text-muted-foreground" },
} as const;

/** One bar per work queue, scaled to the longest, each linking to its page. */
export function AttentionQueues({ queues }: { queues: AttentionQueue[] }) {
  const longest = Math.max(1, ...queues.map((queue) => queue.count));
  if (queues.every((queue) => queue.count === 0)) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <CircleCheck size={18} className="text-success" aria-hidden="true" />
        Nothing is waiting.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {queues.map((queue) => {
        const Icon = ICONS[queue.key] ?? RefreshCw;
        const tone = TONES[queue.tone];
        return (
          <li key={queue.key}>
            <Link
              href={queue.href}
              className={cn(
                "grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-accent/50",
                queue.count === 0 && "opacity-55",
              )}
            >
              <Icon
                size={16}
                className={queue.count ? tone.icon : "text-muted-foreground"}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px]">
                  {queue.label}
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full", tone.bar)}
                    style={{ width: `${(queue.count / longest) * 100}%` }}
                  />
                </span>
              </span>
              <span className="text-right text-sm font-semibold tabular-nums">
                {queue.count}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
