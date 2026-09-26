"use client";

import { Card, CardContent } from "@coursemap/ui/primitives/card";
import {
  compositionSectionUnits,
  type CompositionKind,
  type CompositionSection,
} from "@/lib/coursemap/degree-composition";
import { useElementSize } from "@/hooks/use-element-size";
import { CompositionBlock } from "./composition-block";
import { CompositionInvitation } from "./composition-invitation";
import { compositionLayout } from "./composition-layout";

const titles: Record<CompositionKind, string> = {
  core: "Programme core",
  major: "Major",
  minor: "Minor",
  electives: "Electives",
};

const fills: Record<CompositionKind, string[]> = {
  core: ["bg-blue-300"],
  major: ["bg-violet-300"],
  minor: ["bg-amber-300", "bg-rose-300"],
  electives: ["bg-emerald-300"],
};

const emptyHrefs: Record<Exclude<CompositionKind, "electives">, string> = {
  core: "/requirements?tab=programme",
  major: "/requirements?tab=major",
  minor: "/requirements?tab=minor",
};

/** Space given to an optional major or minor, which states no unit size. */
const OPTIONAL_LAYOUT_UNITS = 24;

/** Half the gap between blocks, in pixels. */
const HALF_GAP = 3;

export function DegreeComposition({
  sections,
  academicYear,
  courseLinks,
}: {
  sections: readonly CompositionSection[];
  academicYear: number | null;
  courseLinks: Record<string, string>;
}) {
  // Blocks are placed in percentages so the first paint is already right; the
  // measured size is only needed to fit slots when a block opens.
  const [areaRef, area] = useElementSize<HTMLDivElement>({
    width: 0,
    height: 0,
  });
  const rects = compositionLayout(
    sections.map(
      (section) => compositionSectionUnits(section) || OPTIONAL_LAYOUT_UNITS,
    ),
    100,
    100,
  );
  const minorIndex = new Map(
    sections
      .filter((section) => section.kind === "minor")
      .map((section, index) => [section.key, index]),
  );
  const courseHref = (code: string) =>
    courseLinks[code] ?? `/courses?q=${code}`;
  const electivesHref =
    academicYear === null ? "/courses" : `/courses?year=${academicYear}`;

  return (
    <Card className="h-full py-0">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Degree composition</h2>
          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {[
              ["Completed", "bg-emerald-500"],
              ["Planned", "bg-violet-500"],
              ["Unallocated", "bg-muted-foreground/40"],
            ].map(([label, colour]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-sm ${colour}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
        {sections.length > 0 ? (
          <div className="relative min-h-52 flex-1">
            {/* The area overhangs by half a gap so outer blocks sit flush. */}
            <div
              ref={areaRef}
              className="absolute"
              style={{ inset: -HALF_GAP }}
            >
              {sections.map((section, index) => {
                const rect = rects[index];
                const palette = fills[section.kind];
                const colour =
                  palette[(minorIndex.get(section.key) ?? 0) % palette.length];
                const title = titles[section.kind];
                return (
                  <div
                    key={section.key}
                    className="absolute flex"
                    style={{
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                      padding: HALF_GAP,
                    }}
                  >
                    {section.unchosen ? (
                      <CompositionInvitation
                        title={title}
                        action={`Add a ${section.kind}`}
                        units={section.targetUnits}
                        href={emptyHrefs[section.kind as "major" | "minor"]}
                        colour={colour}
                      />
                    ) : (
                      <CompositionBlock
                        section={section}
                        title={title}
                        colour={colour}
                        width={(rect.width / 100) * area.width - HALF_GAP * 2}
                        height={
                          (rect.height / 100) * area.height - HALF_GAP * 2
                        }
                        courseHref={courseHref}
                        emptyHref={
                          section.kind === "electives"
                            ? electivesHref
                            : emptyHrefs[section.kind]
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="flex min-h-52 flex-1 items-center justify-center text-sm text-muted-foreground">
            Your degree&apos;s unit total is not published yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
