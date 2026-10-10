"use client";

import { addCampusSurround } from "@/lib/rooms/campus-map-surround";
import { animateLiftCabins } from "@/ui/admin/rooms/animate-lift-cabins";
import { DEFAULT_INDOOR_PALETTE } from "@/lib/rooms/indoor-palette";
import { useTheme } from "next-themes";
import {
  applyCampusMapAppearance,
  isCampusBasemapClutter,
} from "@/lib/rooms/campus-map-appearance";
import { resolveCampusMapImage } from "@/lib/rooms/campus-map-images";
import { Button } from "@coursemap/ui/primitives/button";
import { CampusMapLoading } from "@/ui/rooms/campus-map-loading";

import { useEffect, useRef, useState } from "react";
import { Box, MapPinOff } from "lucide-react";

import {
  addIndoorLayers,
  INDOOR_LAYER_IDS,
  INDOOR_LAYER_ID_LIST,
  updateIndoorLayers,
} from "@/ui/rooms/indoor-3d-layers";
import type { IndoorScene } from "@/lib/rooms/indoor-3d";
import {
  campusLayerControlsStyleLayer,
  getControlledStyleLayerVisibility,
  type CampusMapBuildingGeometry,
  type CampusMapCampus,
  type CampusMapFeature,
  type CampusMapLayer,
  type CampusMapPlace,
  type CampusMapPolygon,
  type CampusWalkingRoute,
} from "@/lib/rooms/campus-map";

type CampusMapProps = {
  campus: CampusMapCampus | null;
  layers: readonly CampusMapLayer[];
  visibleLayerSlugs: ReadonlySet<string>;
  places: readonly CampusMapPlace[];
  features: readonly CampusMapFeature[];
  selectedSlug?: string;
  route: CampusWalkingRoute | null;
  routeEndpoints: Readonly<{
    from: CampusMapPlace;
    to: CampusMapPlace;
  }> | null;
  onSelect: (slug: string) => void;
  onClearSelection: () => void;
  /**
   * The interior of the selected building, drawn as extrusions on the same map.
   * Passing this is what turns a footprint into a building you can see inside.
   */
  indoorScene?: IndoorScene | null;
  /** Camera framing for a building being looked into. */
  indoorFocus?: Readonly<{
    placeSlug: string;
    /** Changes when an indoor control explicitly asks to reframe the building. */
    requestKey?: number;
    pitch?: number;
    bearing?: number;
    maxZoom?: number;
    padding?: number;
  }> | null;
  onCameraSettled?: () => void;
};

const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_ROOM_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/liberty";
const TERRAIN_URL =
  process.env.NEXT_PUBLIC_ROOM_MAP_TERRAIN_URL ??
  "https://tiles.mapterhorn.com/tilejson.json";
const TERRAIN_HILLSHADE_SOURCE_ID = "coursemap-terrain-hillshade-source";
const TERRAIN_LAYER_ID = "coursemap-terrain-hillshade";

const MAP_ATTRIBUTION =
  'Walking routes: <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a>';

type BuildingHighlights = {
  selectedPlaceId: string | null;
  routeFromPlaceId: string | null;
  routeToPlaceId: string | null;
};

type StoredBuildingFeature = CampusMapFeature &
  Readonly<{
    featureKind: "building";
    geometry: CampusMapBuildingGeometry;
  }>;

const ANU_BUILDING_SOURCE_ID = "coursemap-anu-buildings";
const ANU_BUILDING_LAYER_ID = "coursemap-anu-buildings-3d";
const SELECTED_ANU_BUILDING_LAYER_ID = "coursemap-selected-anu-building-3d";
const SELECTED_BUILDING_LABEL_SOURCE_ID = "coursemap-selected-building-label";
const SELECTED_BUILDING_LABEL_LAYER_ID = "coursemap-selected-building-label";
const NATIVE_BUILDING_MAX_ZOOM = 24;
const CAMPUS_PITCH = 35;
const CAMPUS_BEARING = -12;
const INDOOR_LAYER_ID_SET: ReadonlySet<string> = new Set(INDOOR_LAYER_ID_LIST);

type MapSelectionHit =
  | Readonly<{ kind: "building"; placeSlug: string }>
  | Readonly<{ kind: "indoor" }>;

function isStoredBuildingFeature(
  feature: CampusMapFeature,
): feature is StoredBuildingFeature {
  return (
    feature.featureKind === "building" && feature.geometry.type !== "LineString"
  );
}

function toBuildingGeometry(
  geometry: CampusMapBuildingGeometry,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) =>
        ring.map(([longitude, latitude]) => [longitude, latitude]),
      ),
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([longitude, latitude]) => [longitude, latitude]),
      ),
    ),
  };
}

function buildingHighlightKind(
  placeId: string | null,
  highlights: BuildingHighlights,
) {
  if (!placeId) return "default";
  if (placeId === highlights.routeToPlaceId) return "routeTo";
  if (placeId === highlights.routeFromPlaceId) return "routeFrom";
  if (placeId === highlights.selectedPlaceId) return "selected";
  return "default";
}

function buildAnuBuildingCollection(
  features: readonly CampusMapFeature[],
  places: readonly CampusMapPlace[],
  highlights: BuildingHighlights,
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const placeById = new Map(places.map((place) => [place.id, place]));

  return {
    type: "FeatureCollection",
    features: features.filter(isStoredBuildingFeature).map((feature) => {
      const place = feature.placeId ? placeById.get(feature.placeId) : null;
      const heightMetres = Number.isFinite(feature.heightMetres)
        ? Math.max(feature.heightMetres, 0)
        : 5;
      const minimumHeightMetres = Number.isFinite(feature.minimumHeightMetres)
        ? Math.min(Math.max(feature.minimumHeightMetres, 0), heightMetres)
        : 0;

      return {
        type: "Feature",
        id: feature.id,
        properties: {
          featureId: feature.id,
          heightMetres,
          highlight: buildingHighlightKind(feature.placeId, highlights),
          minimumHeightMetres,
          name: feature.name,
          placeId: feature.placeId ?? "",
          placeSlug: place?.slug ?? "",
          selected: feature.placeId === highlights.selectedPlaceId,
          sourceIdentifier: feature.sourceIdentifier,
        },
        geometry: toBuildingGeometry(feature.geometry),
      };
    }),
  };
}

function syncAnuBuildings(
  map: import("maplibre-gl").Map,
  features: readonly CampusMapFeature[],
  places: readonly CampusMapPlace[],
  highlights: BuildingHighlights,
) {
  const source = map.getSource(ANU_BUILDING_SOURCE_ID) as
    import("maplibre-gl").GeoJSONSource | undefined;
  if (!source) return;

  void source.setData(buildAnuBuildingCollection(features, places, highlights));
}

function syncSelectedBuildingLabel(
  map: import("maplibre-gl").Map,
  place: CampusMapPlace | null,
) {
  const source = map.getSource(SELECTED_BUILDING_LABEL_SOURCE_ID) as
    import("maplibre-gl").GeoJSONSource | undefined;
  if (!source) return;

  void source.setData({
    type: "FeatureCollection",
    features: place
      ? [
          {
            type: "Feature",
            properties: { name: place.name, placeSlug: place.slug },
            geometry: {
              type: "Point",
              coordinates: [place.coordinates[0], place.coordinates[1]],
            },
          },
        ]
      : [],
  });
}

function getMapSelectionHitAtPoint(
  map: import("maplibre-gl").Map,
  point: import("maplibre-gl").PointLike,
): MapSelectionHit | null {
  // A room, route or floor belongs to the building that is already open. Do
  // not let the shell behind it re-select the building and clear the current
  // room or floor focus.
  const hitsIndoorScene = map
    .queryRenderedFeatures(point, { layers: [...INDOOR_LAYER_ID_LIST] })
    .some((feature) => INDOOR_LAYER_ID_SET.has(feature.layer.id));
  if (hitsIndoorScene) return { kind: "indoor" };

  const placeSlug = map
    .queryRenderedFeatures(point, {
      layers: [
        ANU_BUILDING_LAYER_ID,
        SELECTED_ANU_BUILDING_LAYER_ID,
        SELECTED_BUILDING_LABEL_LAYER_ID,
      ],
    })
    .map((feature) => feature.properties?.placeSlug)
    .find((placeSlug): placeSlug is string =>
      Boolean(placeSlug && typeof placeSlug === "string"),
    );

  return placeSlug ? { kind: "building", placeSlug } : null;
}

function getBuildingFeaturesForPlace(
  features: readonly CampusMapFeature[],
  placeId: string | undefined,
) {
  if (!placeId) return [];
  return features
    .filter(isStoredBuildingFeature)
    .filter((feature) => feature.placeId === placeId);
}

function getBuildingBounds(
  features: readonly StoredBuildingFeature[],
): [[number, number], [number, number]] | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const feature of features) {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [longitude, latitude] of ring) {
          west = Math.min(west, longitude);
          south = Math.min(south, latitude);
          east = Math.max(east, longitude);
          north = Math.max(north, latitude);
        }
      }
    }
  }

  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

function toGeoJsonGeometry(geometry: CampusMapPolygon): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: geometry.coordinates.map((ring) =>
      ring.map(([longitude, latitude]) => [longitude, latitude]),
    ),
  };
}

function toLngLat(
  coordinate: readonly [longitude: number, latitude: number],
): [number, number] {
  return [coordinate[0], coordinate[1]];
}

function isNativeBuildingExtrusionLayer(
  styleLayer: Readonly<{ id: string; type: string }>,
) {
  return (
    styleLayer.id !== ANU_BUILDING_LAYER_ID &&
    styleLayer.id !== SELECTED_ANU_BUILDING_LAYER_ID &&
    !INDOOR_LAYER_ID_LIST.some((layerId) => layerId === styleLayer.id) &&
    styleLayer.type === "fill-extrusion"
  );
}

function applyStyleLayerVisibility(
  map: import("maplibre-gl").Map,
  layers: readonly CampusMapLayer[],
  visibleLayerSlugs: ReadonlySet<string>,
) {
  for (const styleLayer of map.getStyle().layers) {
    if (isNativeBuildingExtrusionLayer(styleLayer)) {
      map.setLayoutProperty(styleLayer.id, "visibility", "none");
      continue;
    }

    if (isCampusBasemapClutter(styleLayer)) {
      map.setLayoutProperty(styleLayer.id, "visibility", "none");
      continue;
    }
    const visibility = getControlledStyleLayerVisibility(
      styleLayer.id,
      layers,
      visibleLayerSlugs,
    );
    if (visibility) {
      map.setLayoutProperty(styleLayer.id, "visibility", visibility);
    }
  }

  if (map.getLayer(ANU_BUILDING_LAYER_ID)) {
    const visibility = visibleLayerSlugs.has("buildings") ? "visible" : "none";
    for (const layerId of [
      ANU_BUILDING_LAYER_ID,
      SELECTED_ANU_BUILDING_LAYER_ID,
    ]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    }
    if (map.getLayer(SELECTED_BUILDING_LABEL_LAYER_ID)) {
      map.setLayoutProperty(
        SELECTED_BUILDING_LABEL_LAYER_ID,
        "visibility",
        visibility,
      );
    }
  }
}

export function CampusMap({
  campus,
  layers,
  visibleLayerSlugs,
  places,
  features,
  selectedSlug,
  route,
  routeEndpoints,
  onSelect,
  onClearSelection,
  indoorScene = null,
  indoorFocus = null,
  onCameraSettled,
}: CampusMapProps) {
  const { resolvedTheme } = useTheme();
  const themeReady = resolvedTheme !== undefined;
  const darkRef = useRef(resolvedTheme === "dark");
  useEffect(() => {
    darkRef.current = resolvedTheme === "dark";
  }, [resolvedTheme]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const mapLibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const visibleLayerSlugsRef = useRef(visibleLayerSlugs);
  const placesRef = useRef(places);
  const featuresRef = useRef(features);
  const focusedPlaceKeyRef = useRef<string | null>(null);
  const buildingHighlightsRef = useRef<BuildingHighlights>({
    selectedPlaceId: null,
    routeFromPlaceId: null,
    routeToPlaceId: null,
  });
  const onSelectRef = useRef(onSelect);
  const onClearSelectionRef = useRef(onClearSelection);
  const [mapReady, setMapReady] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [isPerspective, setIsPerspective] = useState(true);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection]);

  useEffect(() => {
    visibleLayerSlugsRef.current = visibleLayerSlugs;
  }, [visibleLayerSlugs]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !campus || !themeReady) return;

    let cancelled = false;
    let styleLoaded = false;
    let firstFrameReady = false;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;
    setMapFailed(false);
    setMapReady(false);
    setMapVisible(false);

    void import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled) return;

        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

        const [west, south, east, north] = campus.bounds;
        const map = new maplibregl.Map({
          attributionControl: false,
          bearing: CAMPUS_BEARING,
          canvasContextAttributes: { antialias: true },
          center: toLngLat(campus.initialCoordinates),
          container,
          dragRotate: true,
          keyboard: true,
          maxBounds: [
            [west, south],
            [east, north],
          ],
          maxPitch: 65,
          maxZoom: campus.maxZoom,
          minPitch: 0,
          minZoom: campus.minZoom,
          pitch: CAMPUS_PITCH,
          renderWorldCopies: false,
          style: MAP_STYLE_URL,
          zoom: campus.initialZoom,
        });
        map.setMissingStyleImageResolver((id) =>
          resolveCampusMapImage(map, id),
        );
        mapRef.current = map;
        mapLibreRef.current = maplibregl;

        map.addControl(
          new maplibregl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true,
          }),
          "top-right",
        );
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: MAP_ATTRIBUTION,
          }),
          "bottom-right",
        );

        const updateCameraMetadata = () => {
          const centre = map.getCenter();
          container.dataset.mapBearing = map.getBearing().toFixed(2);
          container.dataset.mapCentre = `${centre.lng.toFixed(6)},${centre.lat.toFixed(6)}`;
          container.dataset.mapPitch = map.getPitch().toFixed(2);
          container.dataset.mapZoom = map.getZoom().toFixed(2);
        };
        const updatePerspective = () => {
          setIsPerspective(map.getPitch() > 10);
          updateCameraMetadata();
        };
        updateCameraMetadata();
        map.on("moveend", updateCameraMetadata);
        map.on("pitch", updatePerspective);

        loadTimeout = setTimeout(() => {
          if (!cancelled && !firstFrameReady) setMapFailed(true);
        }, 12_000);

        map.once("style.load", () => {
          if (cancelled) return;
          styleLoaded = true;
          const styleLayers = map.getStyle().layers;
          const firstTransportLayer = styleLayers.find((layer) =>
            /^(tunnel_|road_|bridge_|building)/.test(layer.id),
          )?.id;
          const buildingsLayer = layers.find(
            (layer) => layer.slug === "buildings",
          );
          const buildingStyleLayers = buildingsLayer
            ? styleLayers.filter((layer) =>
                campusLayerControlsStyleLayer(buildingsLayer, layer.id),
              )
            : [];

          for (const styleLayer of styleLayers) {
            if (isNativeBuildingExtrusionLayer(styleLayer)) {
              map.setLayoutProperty(styleLayer.id, "visibility", "none");
            }
          }

          for (const styleLayer of buildingStyleLayers) {
            if (styleLayer.type === "fill") {
              map.setLayerZoomRange(
                styleLayer.id,
                styleLayer.minzoom ?? 0,
                NATIVE_BUILDING_MAX_ZOOM,
              );
            } else if (styleLayer.type === "fill-extrusion") {
              map.setLayoutProperty(styleLayer.id, "visibility", "none");
            }
          }

          const lastBuildingIndex = Math.max(
            0,
            ...buildingStyleLayers.map((buildingLayer) =>
              styleLayers.findIndex((layer) => layer.id === buildingLayer.id),
            ),
          );
          const firstLabelLayer = styleLayers
            .slice(Math.max(0, lastBuildingIndex + 1))
            .find((layer) => layer.type === "symbol")?.id;

          map.addSource(TERRAIN_HILLSHADE_SOURCE_ID, {
            type: "raster-dem",
            url: TERRAIN_URL,
            tileSize: 512,
            attribution: '<a href="https://mapterhorn.com">Mapterhorn</a>',
          });
          map.addLayer(
            {
              id: TERRAIN_LAYER_ID,
              type: "hillshade",
              source: TERRAIN_HILLSHADE_SOURCE_ID,
              paint: {
                "hillshade-accent-color": "#675f4d",
                "hillshade-exaggeration": 0.28,
                "hillshade-highlight-color": "#fffdf7",
                "hillshade-shadow-color": "#473b24",
              },
            },
            firstTransportLayer,
          );

          map.addSource("campus-boundary", {
            type: "geojson",
            data: toGeoJsonGeometry(campus.boundary),
          });
          map.addLayer(
            {
              id: "campus-boundary-line",
              type: "line",
              source: "campus-boundary",
              paint: {
                "line-color": "#7c3aed",
                "line-dasharray": [2, 2],
                "line-opacity": 0.65,
                "line-width": 2,
              },
            },
            firstLabelLayer,
          );

          map.addSource(ANU_BUILDING_SOURCE_ID, {
            type: "geojson",
            data: buildAnuBuildingCollection(
              featuresRef.current,
              placesRef.current,
              buildingHighlightsRef.current,
            ),
          });
          map.addLayer(
            {
              id: ANU_BUILDING_LAYER_ID,
              type: "fill-extrusion",
              source: ANU_BUILDING_SOURCE_ID,
              filter: ["!=", ["get", "selected"], true],
              paint: {
                "fill-extrusion-base": ["get", "minimumHeightMetres"],
                "fill-extrusion-color": [
                  "match",
                  ["get", "highlight"],
                  "selected",
                  "#7c3aed",
                  "routeFrom",
                  "#7c3aed",
                  "routeTo",
                  "#059669",
                  "#a1a1aa",
                ],
                "fill-extrusion-height": ["get", "heightMetres"],
                "fill-extrusion-opacity": 0.88,
                "fill-extrusion-vertical-gradient": true,
              },
            },
            firstLabelLayer,
          );

          map.addLayer(
            {
              id: SELECTED_ANU_BUILDING_LAYER_ID,
              type: "fill-extrusion",
              source: ANU_BUILDING_SOURCE_ID,
              filter: ["==", ["get", "selected"], true],
              paint: {
                "fill-extrusion-base": ["get", "minimumHeightMetres"],
                "fill-extrusion-color": [
                  "match",
                  ["get", "highlight"],
                  "selected",
                  "#7c3aed",
                  "routeFrom",
                  "#7c3aed",
                  "routeTo",
                  "#059669",
                  "#a1a1aa",
                ],
                "fill-extrusion-height": ["get", "heightMetres"],
                "fill-extrusion-opacity": 0.88,
                "fill-extrusion-vertical-gradient": true,
              },
            },
            firstLabelLayer,
          );

          addIndoorLayers(map, firstLabelLayer);
          // The selected shell is glass only while its interior is visible.
          // It must draw after the indoor extrusions or its depth would hide
          // the rooms that the transparency is meant to reveal.
          map.moveLayer(
            SELECTED_ANU_BUILDING_LAYER_ID,
            INDOOR_LAYER_IDS.labels,
          );

          map.addSource(SELECTED_BUILDING_LABEL_SOURCE_ID, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });

          map.addSource("campus-route", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "campus-route-casing",
            type: "line",
            source: "campus-route",
            paint: {
              "line-color": "#ffffff",
              "line-opacity": 0.95,
              "line-width": 10,
            },
          });

          map.addLayer({
            id: "campus-route-line",
            type: "line",
            source: "campus-route",
            paint: {
              "line-color": "#7c3aed",
              "line-opacity": 0.98,
              "line-width": 6,
            },
          });
          map.addLayer({
            id: SELECTED_BUILDING_LABEL_LAYER_ID,
            type: "symbol",
            source: SELECTED_BUILDING_LABEL_SOURCE_ID,
            layout: {
              "symbol-placement": "point",
              "text-allow-overlap": true,
              "text-anchor": "bottom",
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-ignore-placement": true,
              "text-max-width": 16,
              "text-offset": [0, -0.6],
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                16,
                8,
                18,
                12,
                20,
                14,
              ],
            },
            paint: {
              "text-color": "#27272a",
              "text-halo-blur": 0.5,
              "text-halo-color": "#ffffff",
              "text-halo-width": 1,
            },
          });

          map.on("click", (event) => {
            const selectionHit = visibleLayerSlugsRef.current.has("buildings")
              ? getMapSelectionHitAtPoint(map, event.point)
              : undefined;
            if (selectionHit?.kind === "building") {
              onSelectRef.current(selectionHit.placeSlug);
            } else if (selectionHit?.kind === "indoor") {
              // Keep the selected room and floor while interacting with the
              // interior. Their own controls own any more specific action.
              return;
            } else {
              onClearSelectionRef.current();
            }
          });

          map.on("mousemove", (event) => {
            const selectionHit = visibleLayerSlugsRef.current.has("buildings")
              ? getMapSelectionHitAtPoint(map, event.point)
              : null;
            map.getCanvas().style.cursor =
              selectionHit?.kind === "building" ? "pointer" : "";
          });
          map.on("mouseout", () => {
            map.getCanvas().style.cursor = "";
          });

          applyStyleLayerVisibility(map, layers, visibleLayerSlugsRef.current);
          map.addSource("coursemap-woodland-trees", {
            type: "geojson",
            data: "/map-data/anu-trees-3d.geojson",
          });
          map.addLayer({
            id: "coursemap-woodland-trees",
            type: "fill-extrusion",
            source: "coursemap-woodland-trees",
            minzoom: 15,
            paint: {
              "fill-extrusion-base": ["get", "base"],
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-color": "#78916c",
              "fill-extrusion-opacity": 0.95,
            },
          });
          const campusRing = campus.boundary.coordinates[0];
          const frameWest = Math.min(...campusRing.map(([lng]) => lng));
          const frameEast = Math.max(...campusRing.map(([lng]) => lng));
          const frameSouth = Math.min(...campusRing.map(([, lat]) => lat));
          const frameNorth = Math.max(...campusRing.map(([, lat]) => lat));
          addCampusSurround(map, [
            frameWest,
            frameSouth,
            frameEast,
            frameNorth,
          ]);
          applyCampusMapAppearance(map, darkRef.current);
          setMapReady(true);
          // Style readiness precedes tile loading and the first themed frame.
          map.once("idle", () => {
            if (cancelled) return;
            firstFrameReady = true;
            if (loadTimeout) clearTimeout(loadTimeout);
            setMapVisible(true);
            setMapFailed(false);
          });
        });

        map.on("error", (event) => {
          if (!cancelled && !styleLoaded && event.error) setMapFailed(true);
        });
      })
      .catch(() => {
        if (!cancelled) setMapFailed(true);
      });

    return () => {
      cancelled = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      buildingHighlightsRef.current = {
        selectedPlaceId: null,
        routeFromPlaceId: null,
        routeToPlaceId: null,
      };
      focusedPlaceKeyRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibreRef.current = null;
    };
  }, [campus, layers, themeReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    applyStyleLayerVisibility(map, layers, visibleLayerSlugs);
  }, [layers, mapReady, visibleLayerSlugs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const visibleIndoorScene = visibleLayerSlugs.has("buildings")
      ? indoorScene
      : null;
    updateIndoorLayers(map, visibleIndoorScene);
    if (map.getLayer(ANU_BUILDING_LAYER_ID)) {
      map.setLayoutProperty(
        ANU_BUILDING_LAYER_ID,
        "visibility",
        visibleLayerSlugs.has("buildings") ? "visible" : "none",
      );
    }
    // Only remove the selected shell; neighbouring buildings stay visible.
    if (map.getLayer(SELECTED_ANU_BUILDING_LAYER_ID)) {
      map.setLayoutProperty(
        SELECTED_ANU_BUILDING_LAYER_ID,
        "visibility",
        visibleIndoorScene || !visibleLayerSlugs.has("buildings")
          ? "none"
          : "visible",
      );
    }
    if (map.getLayer(SELECTED_BUILDING_LABEL_LAYER_ID))
      map.setLayoutProperty(
        SELECTED_BUILDING_LABEL_LAYER_ID,
        "visibility",
        visibleIndoorScene ? "none" : "visible",
      );
    // Keep the whole-building preview transparent enough to see connectors.
    for (const [id, opacity] of [
      [INDOOR_LAYER_IDS.slabs, 0.05],
      [INDOOR_LAYER_IDS.slabsInactive, 0.05],
      [INDOOR_LAYER_IDS.rooms, 0.12],
      [INDOOR_LAYER_IDS.roomsInactive, 0.12],
      [INDOOR_LAYER_IDS.walls, 0.18],
      [INDOOR_LAYER_IDS.wallsInactive, 0.18],
      [INDOOR_LAYER_IDS.perimeters, 0.12],
      [INDOOR_LAYER_IDS.perimetersInactive, 0.12],
      [INDOOR_LAYER_IDS.connectors, 0.98],
    ] as const) {
      if (map.getLayer(id))
        map.setPaintProperty(id, "fill-extrusion-opacity", opacity);
    }
    if (map.getLayer(SELECTED_ANU_BUILDING_LAYER_ID)) {
      // Only the selected shell turns to glass while its interior is visible.
      map.setPaintProperty(
        SELECTED_ANU_BUILDING_LAYER_ID,
        "fill-extrusion-opacity",
        visibleIndoorScene ? 0 : 0.88,
      );
    }
  }, [indoorScene, mapReady, visibleLayerSlugs]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !mapVisible ||
      !map ||
      !indoorScene ||
      !visibleLayerSlugs.has("buildings")
    )
      return;
    return animateLiftCabins(
      map,
      indoorScene.connectors,
      DEFAULT_INDOOR_PALETTE,
    );
  }, [mapVisible, indoorScene, visibleLayerSlugs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const selectedPlace = places.find((place) => place.slug === selectedSlug);
    if (
      selectedPlace?.mapDisplayKind !== "building" ||
      !visibleLayerSlugs.has("buildings")
    ) {
      buildingHighlightsRef.current.selectedPlaceId = null;
      syncAnuBuildings(map, features, places, buildingHighlightsRef.current);
      syncSelectedBuildingLabel(map, null);
      focusedPlaceKeyRef.current = null;
      const container = map.getContainer();
      container.dataset.selectedBuilding = "false";
      delete container.dataset.selectedBuildingHeight;
      delete container.dataset.selectedBuildingName;
      delete container.dataset.selectedBuildingId;
      delete container.dataset.selectedBuildingProperties;
      return;
    }

    const selectedFeatures = getBuildingFeaturesForPlace(
      features,
      selectedPlace.id,
    );
    buildingHighlightsRef.current.selectedPlaceId = selectedPlace.id;
    syncAnuBuildings(map, features, places, buildingHighlightsRef.current);
    syncSelectedBuildingLabel(
      map,
      selectedFeatures.length > 0 ? selectedPlace : null,
    );

    const firstFeature = selectedFeatures[0];
    const container = map.getContainer();
    container.dataset.selectedBuilding = String(selectedFeatures.length > 0);
    container.dataset.selectedBuildingHeight = String(
      firstFeature?.heightMetres ?? "",
    );
    container.dataset.selectedBuildingName = firstFeature?.name ?? "";
    container.dataset.selectedBuildingId = selectedFeatures
      .map((feature) => feature.id)
      .join(",");
    container.dataset.selectedBuildingProperties = Object.keys(
      firstFeature?.sourceProperties ?? {},
    ).join(",");

    const bounds = getBuildingBounds(selectedFeatures);
    if (!bounds) return;

    const explicitFocus =
      indoorFocus && indoorFocus.placeSlug === selectedPlace.slug
        ? indoorFocus
        : null;
    // A building with an interior is an indoor destination even when no room
    // has been chosen yet. Frame it for looking through the glass shell as soon
    // as it is selected; a later floor or room choice keeps the same focus.
    const focus =
      explicitFocus ??
      (indoorScene && indoorScene.slabs.features.length > 0
        ? {
            placeSlug: selectedPlace.slug,
            pitch: 55,
            bearing: -20,
            maxZoom: 19.25,
            padding: 88,
          }
        : null);
    const focusKey = [
      selectedPlace.slug,
      focus ? "indoor" : "building",
      focus?.pitch ?? "",
      focus?.bearing ?? "",
      focus?.maxZoom ?? "",
      focus?.padding ?? "",
      focus?.requestKey ?? "",
    ].join(":");
    if (focusedPlaceKeyRef.current === focusKey) return;

    focusedPlaceKeyRef.current = focusKey;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (onCameraSettled) map.once("moveend", onCameraSettled);
    map.fitBounds(bounds, {
      animate: !reduceMotion,
      duration: reduceMotion ? 0 : 450,
      maxZoom: Math.min(focus?.maxZoom ?? 18.5, campus?.maxZoom ?? 18.5),
      padding: focus?.padding ?? 72,
      // Looking into a building wants a low angle; the campus view does not.
      ...(focus
        ? { pitch: focus.pitch ?? 55, bearing: focus.bearing ?? -20 }
        : { pitch: CAMPUS_PITCH, bearing: CAMPUS_BEARING }),
    });
  }, [
    campus?.maxZoom,
    features,
    indoorFocus,
    indoorScene,
    mapReady,
    onCameraSettled,
    places,
    selectedSlug,
    visibleLayerSlugs,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const showBuildings = visibleLayerSlugs.has("buildings");
    buildingHighlightsRef.current.routeFromPlaceId =
      routeEndpoints && showBuildings ? routeEndpoints.from.id : null;
    buildingHighlightsRef.current.routeToPlaceId =
      routeEndpoints && showBuildings ? routeEndpoints.to.id : null;
    syncAnuBuildings(map, features, places, buildingHighlightsRef.current);
  }, [features, mapReady, places, routeEndpoints, visibleLayerSlugs]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibreRef.current;
    if (!mapReady || !map || !maplibregl) return;

    const source = map.getSource("campus-route") as
      import("maplibre-gl").GeoJSONSource | null;

    if (!route || !routeEndpoints) {
      void source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    void source?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: route.coordinates.map(toLngLat),
      },
    });

    // Room destinations keep the camera inside the building. The outdoor leg
    // remains drawn, but must not pull the user away from the floor or indoor
    // step they have just chosen.
    if (
      indoorFocus &&
      indoorScene &&
      routeEndpoints.to.slug === indoorFocus.placeSlug
    ) {
      return;
    }

    const bounds = route.coordinates.reduce(
      (result, coordinate) => result.extend(toLngLat(coordinate)),
      new maplibregl.LngLatBounds(
        toLngLat(route.coordinates[0]),
        toLngLat(route.coordinates[0]),
      ),
    );
    map.fitBounds(bounds, {
      animate: false,
      maxZoom: Math.min(17, campus?.maxZoom ?? 17),
      padding: 64,
    });
  }, [
    campus?.maxZoom,
    indoorFocus,
    indoorScene,
    mapReady,
    route,
    routeEndpoints,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReady && map)
      applyCampusMapAppearance(map, resolvedTheme === "dark");
  }, [mapReady, resolvedTheme]);

  function togglePerspective() {
    const map = mapRef.current;
    if (!map) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    map.easeTo({
      bearing: isPerspective ? 0 : -18,
      duration: reduceMotion ? 0 : 550,
      pitch: isPerspective ? 0 : 52,
    });
  }

  return (
    <div
      aria-busy={Boolean(campus && !mapVisible && !mapFailed)}
      className="room-map relative h-full min-h-80 overflow-hidden bg-muted lg:min-h-0"
    >
      <div
        ref={containerRef}
        aria-label="Interactive vector map of ANU and central Canberra"
        className="h-full w-full"
        style={{ visibility: mapVisible ? "visible" : "hidden" }}
      />

      {campus && !mapVisible && !mapFailed ? <CampusMapLoading /> : null}

      {!campus ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-muted text-sm text-muted-foreground">
          <p className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-sm">
            <MapPinOff aria-hidden="true" size={15} />
            Campus map data is unavailable.
          </p>
        </div>
      ) : null}

      {mapFailed ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
          <p className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
            <MapPinOff aria-hidden="true" size={15} />
            The vector map could not be loaded.
          </p>
        </div>
      ) : null}

      {campus && mapVisible ? (
        <div className="absolute bottom-8 left-3 z-10 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-pressed={isPerspective}
            onClick={togglePerspective}
            type="button"
          >
            <Box aria-hidden="true" size={14} />
            {isPerspective ? "2D view" : "3D view"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
