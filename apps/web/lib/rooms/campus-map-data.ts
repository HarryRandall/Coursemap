import "server-only";
import type {
  CampusMapCampus,
  CampusMapData,
  CampusMapFeature,
  CampusMapLayer,
  CampusMapPlace,
  CampusMapPlaceDetail,
} from "@/lib/rooms/campus-map";
import {
  isCampusMapBuildingGeometry,
  isCampusMapLineString,
  isCampusMapPolygon,
} from "@/lib/rooms/campus-map";
import { readCampusIndoorDocument } from "@/lib/rooms/indoor-map-migrate";
import { buildCampusRoomIndex } from "@/lib/rooms/indoor-room-index";
import { batchCampusMapQueryValues } from "@/lib/rooms/campus-map-query";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type LayerRow = Database["public"]["Tables"]["campus_map_layers"]["Row"];
type CampusRow = Database["public"]["Tables"]["campus_map_campuses"]["Row"];
type FeatureRow = Database["public"]["Tables"]["campus_map_features"]["Row"];
type PlaceRow = Database["public"]["Tables"]["campus_map_places"]["Row"];
type PlaceDetailRow =
  Database["public"]["Tables"]["campus_map_place_details"]["Row"];
type IndoorMapRow = Database["public"]["Tables"]["campus_indoor_maps"]["Row"];

export type CampusMapLoadResult = Readonly<{
  data: CampusMapData;
  error: string | null;
}>;

export type LoadCampusMapDataOptions = Readonly<{
  /**
   * Uses the viewer's request-scoped client. Existing RLS then adds drafts only
   * for people with rooms.manage; everyone else still sees published maps.
   */
  includeManageableDrafts?: boolean;
}>;

const EMPTY_CAMPUS_MAP_DATA: CampusMapData = {
  rooms: [],
  campus: null,
  layers: [],
  places: [],
  features: [],
  indoorMaps: [],
};

function mapCampus(row: CampusRow): CampusMapCampus {
  if (!isCampusMapPolygon(row.boundary_geojson)) {
    throw new Error("Campus boundary geometry is invalid.");
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    boundary: row.boundary_geojson,
    bounds: [row.west, row.south, row.east, row.north],
    initialCoordinates: [row.initial_longitude, row.initial_latitude],
    initialZoom: row.initial_zoom,
    minZoom: row.min_zoom,
    maxZoom: row.max_zoom,
    sourceIdentifier: row.source_identifier,
    sourceUrl: row.source_url,
    sourceLicense: row.source_license,
  };
}

function mapLayer(row: LayerRow): CampusMapLayer {
  return {
    id: row.id,
    campusId: row.campus_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    colour: row.colour,
    isVisibleByDefault: row.is_visible_by_default,
    layerKind: row.layer_kind as CampusMapLayer["layerKind"],
    styleLayerPatterns: row.style_layer_patterns,
    sortOrder: row.sort_order,
  };
}

function mapFeature(row: FeatureRow): CampusMapFeature {
  const featureKind = row.feature_kind;
  const geometry = row.geometry_geojson;
  if (featureKind !== "building" && featureKind !== "walking_path") {
    throw new Error("Campus feature geometry is invalid.");
  }

  const parsedGeometry =
    featureKind === "building"
      ? isCampusMapBuildingGeometry(geometry)
        ? geometry
        : null
      : isCampusMapLineString(geometry)
        ? geometry
        : null;
  if (!parsedGeometry) throw new Error("Campus feature geometry is invalid.");

  return {
    id: row.id,
    campusId: row.campus_id,
    layerId: row.layer_id,
    placeId: row.place_id,
    slug: row.slug,
    name: row.name,
    featureKind,
    geometry: parsedGeometry,
    heightMetres: row.height_metres,
    minimumHeightMetres: row.minimum_height_metres,
    sourceProperties:
      row.source_properties &&
      typeof row.source_properties === "object" &&
      !Array.isArray(row.source_properties)
        ? row.source_properties
        : {},
    sourceIdentifier: row.source_identifier,
    sourceUrl: row.source_url,
    sourceLicense: row.source_license,
    sortOrder: row.sort_order,
  };
}

function mapDetail(row: PlaceDetailRow): CampusMapPlaceDetail {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

function mapPlace(
  row: PlaceRow,
  details: readonly PlaceDetailRow[],
): CampusMapPlace {
  return {
    id: row.id,
    layerId: row.layer_id,
    slug: row.slug,
    name: row.name,
    markerLabel: row.marker_label,
    address: row.address,
    coordinates: [row.longitude, row.latitude],
    officialUrl: row.official_url,
    dataStatus: row.data_status as CampusMapPlace["dataStatus"],
    mapDisplayKind: row.map_display_kind as CampusMapPlace["mapDisplayKind"],
    isRoutable: row.is_routable,
    searchTerms: row.search_terms,
    sortOrder: row.sort_order,
    details: details.map(mapDetail),
  };
}

function mapIndoorMap(row: IndoorMapRow) {
  return {
    id: row.id,
    buildingPlaceId: row.building_place_id,
    name: row.name,
    status: row.status as "draft" | "published",
    revision: row.revision,
    document: readCampusIndoorDocument(row.document),
  };
}

export async function loadCampusMapData(
  options: LoadCampusMapDataOptions = {},
): Promise<CampusMapLoadResult> {
  if (!getSupabaseConfig()) {
    return {
      data: EMPTY_CAMPUS_MAP_DATA,
      error: "Room Finder data is not configured.",
    };
  }

  try {
    // Base-map data remains identical for every viewer. Only the indoor-map
    // query needs request auth so its existing RLS policy can add manager
    // drafts without also exposing draft campuses, layers or features.
    const publicSupabase = createPublicClient();
    const indoorSupabase = options.includeManageableDrafts
      ? await createClient()
      : publicSupabase;
    const campusResult = await publicSupabase
      .from("campus_map_campuses")
      .select(
        "id,slug,name,boundary_geojson,west,south,east,north,initial_longitude,initial_latitude,initial_zoom,min_zoom,max_zoom,source_identifier,source_url,source_license,status,sort_order,created_at,updated_at",
      )
      .order("sort_order")
      .order("name")
      .limit(1)
      .maybeSingle();

    if (campusResult.error || !campusResult.data) {
      return {
        data: EMPTY_CAMPUS_MAP_DATA,
        error: "Room Finder data could not be loaded.",
      };
    }

    const campus = mapCampus(campusResult.data);
    const [layersResult, featuresResult] = await Promise.all([
      publicSupabase
        .from("campus_map_layers")
        .select(
          "id,campus_id,slug,name,description,colour,is_visible_by_default,layer_kind,style_layer_patterns,status,sort_order,created_at,updated_at",
        )
        .eq("campus_id", campus.id)
        .order("sort_order")
        .order("name"),
      publicSupabase
        .from("campus_map_features")
        .select(
          "id,campus_id,layer_id,place_id,slug,name,feature_kind,geometry_geojson,height_metres,minimum_height_metres,source_properties,source_identifier,source_url,source_license,status,sort_order,created_at,updated_at",
        )
        .eq("campus_id", campus.id)
        .order("sort_order")
        .order("name"),
    ]);

    if (layersResult.error || featuresResult.error) {
      return {
        data: EMPTY_CAMPUS_MAP_DATA,
        error: "Room Finder data could not be loaded.",
      };
    }

    const layers = (layersResult.data ?? []).map(mapLayer);
    const layerIds = layers.map((layer) => layer.id);
    const placesResult = layerIds.length
      ? await publicSupabase
          .from("campus_map_places")
          .select(
            "id,layer_id,slug,name,marker_label,address,longitude,latitude,official_url,data_status,map_display_kind,is_routable,search_terms,source_provider,source_identifier,source_url,source_license,source_version,source_updated_at,status,sort_order,created_at,updated_at",
          )
          .in("layer_id", layerIds)
          .order("sort_order")
          .order("name")
      : { data: [], error: null };

    if (placesResult.error) {
      return {
        data: EMPTY_CAMPUS_MAP_DATA,
        error: "Room Finder data could not be loaded.",
      };
    }

    const placeRows = placesResult.data ?? [];
    const placeIds = placeRows.map((place) => place.id);
    const placeIdBatches = batchCampusMapQueryValues(placeIds);
    const [detailResults, indoorMapResults] = await Promise.all([
      Promise.all(
        placeIdBatches.map((placeIdBatch) =>
          publicSupabase
            .from("campus_map_place_details")
            .select("id,place_id,kind,label,sort_order,created_at,updated_at")
            .in("place_id", placeIdBatch)
            .order("sort_order")
            .order("label"),
        ),
      ),
      Promise.all(
        placeIdBatches.map((placeIdBatch) => {
          const query = indoorSupabase
            .from("campus_indoor_maps")
            .select(
              "id,building_place_id,name,document,status,revision,source_provider,source_url,source_license,published_at,created_at,updated_at",
            )
            .in("building_place_id", placeIdBatch);
          return (
            options.includeManageableDrafts
              ? query.in("status", ["published", "draft"])
              : query.eq("status", "published")
          ).order("name");
        }),
      ),
    ]);

    if (
      detailResults.some((result) => result.error) ||
      indoorMapResults.some((result) => result.error)
    ) {
      return {
        data: EMPTY_CAMPUS_MAP_DATA,
        error: "Room Finder data could not be loaded.",
      };
    }

    const detailsByPlace = new Map<string, PlaceDetailRow[]>();
    for (const detail of detailResults.flatMap((result) => result.data ?? [])) {
      const details = detailsByPlace.get(detail.place_id) ?? [];
      details.push(detail);
      detailsByPlace.set(detail.place_id, details);
    }

    const indoorMaps = indoorMapResults
      .flatMap((result) => result.data ?? [])
      .map(mapIndoorMap);

    return {
      data: {
        campus,
        layers,
        places: placeRows.map((place) =>
          mapPlace(place, detailsByPlace.get(place.id) ?? []),
        ),
        features: (featuresResult.data ?? []).map(mapFeature),
        indoorMaps,
        rooms: buildCampusRoomIndex(indoorMaps, placeRows),
      },
      error: null,
    };
  } catch {
    return {
      data: EMPTY_CAMPUS_MAP_DATA,
      error: "Room Finder data could not be loaded.",
    };
  }
}

/** Reads only published routing endpoints, without geometry or indoor documents. */
export async function loadCampusRoutePlaces(slugs: readonly string[]) {
  if (!getSupabaseConfig()) {
    return { places: [], error: "Room Finder data is not configured." };
  }
  try {
    const { data, error } = await createPublicClient()
      .from("campus_map_places")
      .select("id,slug,longitude,latitude,is_routable")
      .in("slug", [...slugs]);
    if (error) throw error;
    return {
      places: (data ?? []).map((place) => ({
        id: place.id,
        slug: place.slug,
        coordinates: [place.longitude, place.latitude] as [number, number],
        isRoutable: place.is_routable,
      })),
      error: null,
    };
  } catch {
    return { places: [], error: "Room Finder data could not be loaded." };
  }
}
