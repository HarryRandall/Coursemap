"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getDefaultVisibleLayerSlugs,
  isCampusWalkingRoute,
} from "@/lib/rooms/campus-map";
import type { CampusMapData, CampusWalkingRoute } from "@/lib/rooms/campus-map";
import { CampusMap } from "@/ui/rooms/campus-map";
import type { AssistantPlace } from "@/lib/assistant/attachments";

type EmbeddedMapData = Pick<
  CampusMapData,
  "campus" | "layers" | "places" | "features"
>;

// Every place card shares one download of the published map.
let mapData: Promise<EmbeddedMapData | null> | null = null;
function loadMapData() {
  mapData ??= fetch("/api/rooms/map")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return mapData;
}

/**
 * The 3D campus map framed on one building, with the walking route when the
 * student asked for directions. It is a preview: the map ignores the pointer
 * so the chat keeps scrolling, and the card opens the full Room finder.
 */
export function AssistantPlaceMap({ place }: { place: AssistantPlace }) {
  const [data, setData] = useState<EmbeddedMapData | null>(null);
  const [route, setRoute] = useState<CampusWalkingRoute | null>(null);
  useEffect(() => {
    let active = true;
    void loadMapData().then((loaded) => {
      if (active) setData(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  const fromSlug = place.from?.slug;
  useEffect(() => {
    if (!fromSlug) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: fromSlug, to: place.slug });
    fetch(`/api/rooms/directions?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (isCampusWalkingRoute(body)) setRoute(body);
      })
      .catch(() => {
        // Without a route the preview still frames the destination.
      });
    return () => controller.abort();
  }, [fromSlug, place.slug]);
  const layers = useMemo(
    () => (data ? getDefaultVisibleLayerSlugs(data.layers) : new Set<string>()),
    [data],
  );
  const endpoints = useMemo(() => {
    const to = data?.places.find((item) => item.slug === place.slug);
    const from = data?.places.find((item) => item.slug === fromSlug);
    return to && from ? { from, to } : null;
  }, [data, place.slug, fromSlug]);
  if (!data) return <div className="size-full animate-pulse bg-muted" />;
  return (
    <div aria-hidden="true" className="pointer-events-none size-full">
      <CampusMap
        campus={data.campus}
        layers={data.layers}
        visibleLayerSlugs={layers}
        places={data.places}
        features={data.features}
        selectedSlug={place.slug}
        route={route}
        routeEndpoints={route ? endpoints : null}
        onSelect={() => {}}
        onClearSelection={() => {}}
      />
    </div>
  );
}
