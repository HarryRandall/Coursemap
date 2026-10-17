"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import {
  compositionSectionUnits,
  type CompositionKind,
  type CompositionSection,
} from "@/lib/coursemap/degree-composition";

const titles: Record<CompositionKind, string> = {
  core: "Programme core",
  major: "Major",
  minor: "Minor",
  electives: "Electives",
};

const sectionHrefs: Record<Exclude<CompositionKind, "electives">, string> = {
  core: "/requirements?tab=programme",
  major: "/requirements?tab=major",
  minor: "/requirements?tab=minor",
};

function unitsIn(section: CompositionSection, status: "completed" | "planned") {
  return section.courses
    .filter((course) => course.status === status)
    .reduce((total, course) => total + course.units, 0);
}

/**
 * The degree as one row per part: the programme core, the major, each minor
 * and electives. Each bar splits the part's units into completed, planned
 * and still open, so the legend's three states read in every row; a major or
 * minor not yet chosen invites the student to pick one.
 */
export function DegreeComposition({
  sections,
  academicYear,
}: {
  sections: readonly CompositionSection[];
  academicYear: number | null;
}) {
  const electivesHref =
    academicYear === null ? "/courses" : `/courses?year=${academicYear}`;

  return (
    <Card className="h-full py-0">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold">Degree composition</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {[
              ["Completed", "bg-success"],
              ["Planned", "bg-primary"],
              ["Open", "bg-muted-foreground/25"],
            ].map(([label, colour]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-sm ${colour}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
        {sections.length > 0 ? (
          <ul className="-mx-2 flex flex-1 flex-col justify-center gap-1">
            {sections.map((section, index) => {
              const title = titles[section.kind];
              const href =
                section.kind === "electives"
                  ? electivesHref
                  : sectionHrefs[section.kind];
              const total = compositionSectionUnits(section);
              const completed = unitsIn(section, "completed");
              const planned = unitsIn(section, "planned");
              const share = (units: number) =>
                total > 0 ? `${Math.min(100, (units / total) * 100)}%` : "0%";
              return (
                <li
                  key={section.key}
                  className="enter-pop"
                  style={
                    {
                      "--enter-delay": `${160 + index * 60}ms`,
                    } as CSSProperties
                  }
                >
                  <Link
                    href={href}
                    className="group flex flex-col gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-baseline gap-2 text-sm">
                      <span className="shrink-0 font-medium text-foreground">
                        {title}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {section.unchosen
                          ? "Not chosen yet"
                          : (section.structureName ?? "")}
                      </span>
                      {section.unchosen ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                          <Plus size={13} aria-hidden="true" />
                          Add a {section.kind}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          <span className="font-medium text-foreground">
                            {completed + planned}
                          </span>{" "}
                          of {total || "?"} units
                        </span>
                      )}
                      <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                    {section.unchosen ? (
                      <span
                        aria-hidden="true"
                        className="h-2 rounded-full border border-dashed border-muted-foreground/40"
                      />
                    ) : (
                      <span
                        role="img"
                        aria-label={`${completed} units completed and ${planned} planned of ${total || "an unpublished number of"} units`}
                        className="flex h-2 overflow-hidden rounded-full bg-muted-foreground/15"
                      >
                        <span
                          className="enter-grow-across h-full bg-success"
                          style={{ width: share(completed) }}
                        />
                        <span
                          className="enter-grow-across h-full bg-primary"
                          style={{ width: share(planned) }}
                        />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex min-h-52 flex-1 items-center justify-center text-sm text-muted-foreground">
            Your degree&apos;s unit total is not published yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
