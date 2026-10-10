"use client";
import { ACADEMIC_TIME_ZONE } from "@/lib/canberra-format";
import { badgeVariantForTone } from "@/lib/ui";

import { Badge } from "@coursemap/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { Button } from "@coursemap/ui/primitives/button";
import { buildIndoorScene } from "@/lib/rooms/indoor-3d";
import {
  projectBuildingFootprint,
  remapIndoorDocumentToFootprint,
} from "@/lib/rooms/indoor-footprint";
import { isCampusMapBuildingGeometry } from "@/lib/rooms/campus-map";
import {
  loadIndoorMapForBuilding,
  type CampusIndoorMapEditorRecord,
} from "@/lib/rooms/indoor-map-admin";
import { Input } from "@coursemap/ui/primitives/input";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinned, Search } from "lucide-react";
import { CampusMap } from "@/ui/rooms/campus-map";
import { BuildingPickerLayout } from "./building-picker-layout";

import { cn } from "@/lib/cn";
import { indoorMapStatusTone } from "@/ui/admin/rooms/indoor-status";
import {
  getDefaultVisibleLayerSlugs,
  type CampusMapData,
  type CampusMapPlace,
} from "@/lib/rooms/campus-map";
import type { CampusIndoorMapSummary } from "@/lib/rooms/indoor-map-admin";

const RESULT_LIMIT = 40;

function matchesBuilding(place: CampusMapPlace, terms: readonly string[]) {
  if (terms.length === 0) return true;
  const searchable = [place.name, place.address, ...place.searchTerms]
    .join(" ")
    .toLocaleLowerCase("en-AU");
  return terms.every((term) => searchable.includes(term));
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: ACADEMIC_TIME_ZONE,
  }).format(date);
}

/**
 * Choosing a building to map. The campus map is the primary way in, because
 * picking a building off a map is how anyone actually thinks about it; the
 * search and the list of started maps are for when you already know the name.
 */
export function BuildingPicker({
  buildings,
  mapData,
  summaries,
}: {
  buildings: readonly CampusMapPlace[];
  mapData: CampusMapData;
  summaries: readonly CampusIndoorMapSummary[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>();

  const [preview, setPreview] = useState<{
    slug: string;
    record: CampusIndoorMapEditorRecord;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const selectedBuilding = buildings.find(
    (building) => building.slug === selectedSlug,
  );
  const indoorScene = useMemo(() => {
    if (
      !selectedBuilding ||
      !preview ||
      preview?.slug !== selectedSlug ||
      !preview.record.document.levels.length
    )
      return null;
    const feature = mapData.features.find(
      (item) =>
        item.placeId === selectedBuilding.id &&
        item.featureKind === "building" &&
        isCampusMapBuildingGeometry(item.geometry),
    );
    if (!feature || !isCampusMapBuildingGeometry(feature.geometry)) return null;
    const projection = projectBuildingFootprint(feature.geometry);
    return buildIndoorScene(
      remapIndoorDocumentToFootprint(preview.record.document, projection),
      projection,
      { explode: 2.25, activeLevelId: null, showInactiveLevels: true },
    );
  }, [mapData.features, preview, selectedBuilding, selectedSlug]);
  function clearSelection() {
    requestRef.current++;
    setSelectedSlug(undefined);
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
  }

  const summaryByBuilding = useMemo(
    () =>
      new Map(summaries.map((summary) => [summary.buildingPlaceId, summary])),
    [summaries],
  );
  const visibleLayerSlugs = useMemo(
    () => getDefaultVisibleLayerSlugs(mapData.layers),
    [mapData.layers],
  );

  const terms = query
    .trim()
    .toLocaleLowerCase("en-AU")
    .split(/\s+/)
    .filter(Boolean);
  const results = buildings.filter((place) => matchesBuilding(place, terms));
  const started = buildings.filter((place) => summaryByBuilding.has(place.id));
  const listed = terms.length > 0 ? results : started;

  function editBuilding(slug: string) {
    router.push(`/admin/rooms/${encodeURIComponent(slug)}`);
  }

  async function previewBuilding(slug: string) {
    const request = ++requestRef.current;
    setSelectedSlug(slug);
    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await loadIndoorMapForBuilding(slug);
      if (requestRef.current === request) {
        if (data) setPreview({ slug, record: data.record });
        else setPreviewError("This building could not be loaded.");
      }
    } catch {
      if (requestRef.current === request)
        setPreviewError(
          "The indoor preview could not be loaded. Try selecting the building again.",
        );
    } finally {
      if (requestRef.current === request) setPreviewLoading(false);
    }
  }

  return (
    <BuildingPickerLayout
      rail={
        <>
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/80"
                size={15}
              />
              <Input
                aria-label="Search ANU buildings"
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a building to map"
                type="search"
                value={query}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {terms.length > 0
                ? `${results.length} of ${buildings.length} buildings`
                : `${started.length} of ${buildings.length} buildings mapped`}
            </p>
          </div>

          <nav
            aria-label={
              terms.length > 0 ? "Search results" : "Buildings with a map"
            }
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {listed.length === 0 ? (
              <Empty className="mt-6 px-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {terms.length > 0 ? (
                      <Search aria-hidden="true" />
                    ) : (
                      <MapPinned aria-hidden="true" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {terms.length > 0 ? "Nothing found" : "No maps yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {terms.length > 0
                      ? "Try a building number or a street name."
                      : "Pick a building on the map to start its first floor plan."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="space-y-0.5">
                {listed.slice(0, RESULT_LIMIT).map((place) => {
                  const summary = summaryByBuilding.get(place.id);
                  const updatedAt = formatUpdatedAt(summary?.updatedAt ?? null);
                  return (
                    <li key={place.id}>
                      <button
                        className={cn(
                          "flex min-h-11 w-full items-start gap-2 rounded-md px-2.5 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
                          place.slug === selectedSlug && "bg-primary/10",
                        )}
                        onClick={() => previewBuilding(place.slug)}
                        type="button"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {place.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {summary
                              ? `${summary.levelCount} level${summary.levelCount === 1 ? "" : "s"} · ${summary.roomCount} room${summary.roomCount === 1 ? "" : "s"}${updatedAt ? ` · ${updatedAt}` : ""}`
                              : place.address}
                          </span>
                        </span>
                        {summary ? (
                          <Badge
                            variant={
                              badgeVariantForTone[
                                indoorMapStatusTone(summary.status)
                              ]
                            }
                          >
                            {summary.status}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {listed.length > RESULT_LIMIT ? (
              <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                {listed.length - RESULT_LIMIT} more. Keep typing to narrow it
                down.
              </p>
            ) : null}
          </nav>
        </>
      }
    >
      <CampusMap
        campus={mapData.campus}
        features={mapData.features}
        layers={mapData.layers}
        indoorScene={indoorScene}
        onClearSelection={clearSelection}
        onSelect={(slug) => {
          previewBuilding(slug);
        }}
        places={mapData.places}
        route={null}
        routeEndpoints={null}
        selectedSlug={selectedSlug}
        visibleLayerSlugs={visibleLayerSlugs}
      />
      {selectedBuilding ? (
        <section
          aria-label="Selected building"
          className="absolute top-3 left-3 max-w-[calc(100%-5rem)] rounded-lg border bg-card/95 p-3 shadow-sm"
        >
          <h2 className="text-sm font-semibold">{selectedBuilding.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {previewLoading
              ? "Loading indoor preview…"
              : (previewError ??
                (indoorScene ? "3D indoor preview" : "No indoor map yet"))}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => editBuilding(selectedBuilding.slug)}
            >
              Edit indoor map
            </Button>
            <Button size="sm" variant="outline" onClick={clearSelection}>
              Close
            </Button>
          </div>
        </section>
      ) : null}
    </BuildingPickerLayout>
  );
}
