"use client";

import { useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { filterRoadmapStages, roadmapAreas } from "@/lib/roadmap";
import type { RoadmapStage } from "@/lib/roadmap";
import { FilterBar } from "@/ui/common/filter-bar";
import { RoadmapTimeline } from "@/ui/roadmap/roadmap-timeline";

export function RoadmapExplorer({ stages }: { stages: RoadmapStage[] }) {
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const filtered = filterRoadmapStages(
    stages,
    query,
    values.stage ?? "",
    values.area ?? "",
  );
  const areas = new Set(
    stages.flatMap((stage) => stage.items.map((item) => item.area)),
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <FilterBar
        searchPlaceholder="Search roadmap..."
        filters={[
          {
            key: "stage",
            label: "Stage",
            allLabel: "All stages",
            options: stages.map((stage) => ({
              value: stage.id,
              label: stage.title,
            })),
          },
          {
            key: "area",
            label: "Area",
            allLabel: "All areas",
            options: Object.entries(roadmapAreas)
              .filter(([value]) =>
                areas.has(value as keyof typeof roadmapAreas),
              )
              .map(([value, label]) => ({ value, label })),
          },
        ]}
        state={{
          query,
          values: { stage: "", area: "", ...values },
          onQueryChange: setQuery,
          onFilterChange: (key, value) =>
            setValues((current) => ({ ...current, [key]: value })),
        }}
      />
      <p className="sr-only" role="status">
        Results:{" "}
        {filtered.reduce((count, stage) => count + stage.items.length, 0)}
      </p>
      {filtered.length ? (
        <RoadmapTimeline stages={filtered} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border px-6 py-16 text-center">
          <h2 className="text-base font-semibold">No matching roadmap items</h2>
          <p className="text-sm text-muted-foreground">
            Try another search or clear your filters.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setValues({});
            }}
          >
            Clear search and filters
          </Button>
        </div>
      )}
    </div>
  );
}
