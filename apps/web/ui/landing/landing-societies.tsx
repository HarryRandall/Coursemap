import type { CSSProperties } from "react";
import type { LandingSocietyRow } from "@/lib/coursemap/landing-data";
import { SocietyEmblem } from "@/ui/societies/society-emblem";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

/** Published societies with their logos, nudged along on hover. */
export function LandingSocieties({
  rows,
}: {
  rows: readonly LandingSocietyRow[];
}) {
  return (
    <ul className="space-y-1.5">
      {rows.map(({ society, detail }, index) => (
        <li
          key={society.slug}
          className="enter-rise flex h-12 items-center gap-2.5 rounded-md border border-border bg-background px-2.5 transition-[translate,border-color] duration-300 group-hover:translate-x-1 group-hover:border-primary/30"
          style={{ ...delay(index * 90), transitionDelay: `${index * 50}ms` }}
        >
          <SocietyEmblem society={society} small />
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium">
              {society.name}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {detail}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
