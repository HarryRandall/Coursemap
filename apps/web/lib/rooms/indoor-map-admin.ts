"use server";

import { revalidatePath } from "next/cache";
import { revalidatePublishedCampusMap } from "@/lib/rooms/published-cache";
import { canManageRooms } from "@/lib/auth/viewer";
import {
  isCampusMapBuildingGeometry,
  type CampusMapData,
  type CampusMapPlace,
} from "@/lib/rooms/campus-map";
import { loadCampusMapData } from "@/lib/rooms/campus-map-data";
import {
  isIndoorDocumentWithinFootprint,
  projectBuildingFootprint,
} from "@/lib/rooms/indoor-footprint";
import {
  createEmptyCampusIndoorDocument,
  parseCampusIndoorDocument,
  type CampusIndoorDocument,
} from "@/lib/rooms/indoor-map";
import { readCampusIndoorDocument } from "@/lib/rooms/indoor-map-migrate";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type CampusIndoorMapRow =
  Database["public"]["Tables"]["campus_indoor_maps"]["Row"];

export type { CampusIndoorDocument } from "@/lib/rooms/indoor-map";

export type CampusIndoorMapStatus = "draft" | "published" | "archived";

export type CampusIndoorMapEditorRecord = Readonly<{
  id: string | null;
  buildingPlaceId: string;
  name: string;
  status: CampusIndoorMapStatus;
  revision: number;
  document: CampusIndoorDocument;
  updatedAt: string | null;
}>;

/** What the picker needs: which buildings exist and which already have a map. */
export type CampusIndoorMapSummary = Readonly<{
  buildingPlaceId: string;
  name: string;
  status: CampusIndoorMapStatus;
  revision: number;
  updatedAt: string | null;
  levelCount: number;
  roomCount: number;
}>;

export type CampusIndoorMapPickerData = Readonly<{
  mapData: CampusMapData;
  buildings: readonly CampusMapPlace[];
  summaries: readonly CampusIndoorMapSummary[];
}>;

export type CampusIndoorMapEditorData = Readonly<{
  mapData: CampusMapData;
  building: CampusMapPlace;
  record: CampusIndoorMapEditorRecord;
}>;

export type SaveCampusIndoorMapInput = Readonly<{
  buildingPlaceId: string;
  name: string;
  document: unknown;
  revision: number;
  status: "draft" | "published";
}>;

export type SaveCampusIndoorMapResult = Readonly<{
  ok: boolean;
  message: string;
  revision: number;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MAP_NAME_LENGTH = 200;

function isIndoorMapStatus(value: string): value is CampusIndoorMapStatus {
  return value === "draft" || value === "published" || value === "archived";
}

function isBuildingPlace(
  place: CampusMapPlace,
  mapData: CampusMapData,
): boolean {
  return (
    place.mapDisplayKind === "building" &&
    mapData.features.some(
      (feature) =>
        feature.featureKind === "building" && feature.placeId === place.id,
    )
  );
}

function emptyEditorRecord(place: CampusMapPlace): CampusIndoorMapEditorRecord {
  return {
    id: null,
    buildingPlaceId: place.id,
    name: `${place.name} indoor map`,
    status: "draft",
    revision: 0,
    document: createEmptyCampusIndoorDocument(),
    updatedAt: null,
  };
}

function editorRecord(row: CampusIndoorMapRow): CampusIndoorMapEditorRecord {
  if (!isIndoorMapStatus(row.status)) {
    throw new TypeError(`Indoor map '${row.id}' has an invalid status.`);
  }

  return {
    id: row.id,
    buildingPlaceId: row.building_place_id,
    name: row.name,
    status: row.status,
    revision: row.revision,
    document: readCampusIndoorDocument(row.document),
    updatedAt: row.updated_at,
  };
}

function failure(message: string, revision = 0): SaveCampusIndoorMapResult {
  return { ok: false, message, revision };
}

const EDITOR_COLUMNS =
  "id,building_place_id,name,document,status,revision,source_provider,source_url,source_license,published_at,created_at,updated_at";

async function loadEditorRows(
  buildingPlaceId?: string,
): Promise<CampusIndoorMapEditorRecord[]> {
  if (!getSupabaseConfig() || !(await canManageRooms())) {
    return [];
  }

  const supabase = await createClient();
  const query = supabase.from("campus_indoor_maps").select(EDITOR_COLUMNS);
  const { data, error } = await (buildingPlaceId
    ? query.eq("building_place_id", buildingPlaceId).limit(1)
    : query.order("updated_at", { ascending: false }).limit(1000));

  if (error) {
    throw new Error("Indoor map editor data could not be loaded.", {
      cause: error,
    });
  }
  return ((data ?? []) as CampusIndoorMapRow[]).map(editorRecord);
}

/**
 * Everything the building picker needs. Deliberately no documents: shipping a
 * floor plan for all 280 buildings to choose between them would be absurd.
 */
export async function loadIndoorMapPickerData(): Promise<CampusIndoorMapPickerData> {
  const { data: mapData, error: mapError } = await loadCampusMapData();
  const buildings = mapData.places
    .filter((place) => isBuildingPlace(place, mapData))
    .toSorted((left, right) => left.name.localeCompare(right.name, "en-AU"));

  if (mapError || buildings.length === 0) {
    return { mapData, buildings, summaries: [] };
  }

  const buildingIds = new Set(buildings.map((place) => place.id));
  const records = await loadEditorRows();

  return {
    mapData,
    buildings,
    summaries: records
      .filter((record) => buildingIds.has(record.buildingPlaceId))
      .map((record) => ({
        buildingPlaceId: record.buildingPlaceId,
        name: record.name,
        status: record.status,
        revision: record.revision,
        updatedAt: record.updatedAt,
        levelCount: record.document.levels.length,
        roomCount: record.document.spaces.filter(
          (space) => space.kind === "room",
        ).length,
      })),
  };
}

/**
 * Loads one building's map for editing. A building with no saved document
 * starts against its real OpenStreetMap footprint, so the canvas is the real
 * building from the moment it opens rather than something to opt into later.
 */
export async function loadIndoorMapForBuilding(
  slug: string,
): Promise<CampusIndoorMapEditorData | null> {
  const { data: mapData } = await loadCampusMapData();
  const building = mapData.places.find(
    (place) => place.slug === slug && isBuildingPlace(place, mapData),
  );
  if (!building) return null;

  const saved = (await loadEditorRows(building.id)).at(0);

  return {
    mapData,
    building,
    record: saved ?? emptyEditorRecord(building),
  };
}

/**
 * Save one building document using optimistic concurrency. The revision guard
 * makes the write atomic without silently replacing a newer editor save.
 */
export async function saveCampusIndoorMap(
  input: SaveCampusIndoorMapInput,
): Promise<SaveCampusIndoorMapResult> {
  if (!input || typeof input !== "object") {
    return failure("That indoor map is not valid.");
  }

  const buildingPlaceId = input.buildingPlaceId?.trim();
  const name = input.name?.trim();
  if (!UUID_PATTERN.test(buildingPlaceId)) {
    return failure("That building is not valid.");
  }
  if (!name || name.length > MAX_MAP_NAME_LENGTH) {
    return failure("Enter an indoor map name of 200 characters or fewer.");
  }
  if (input.status !== "draft" && input.status !== "published") {
    return failure("That indoor map status is not valid.");
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failure("That indoor map revision is not valid.");
  }

  if (!getSupabaseConfig()) {
    return failure("Indoor map storage is not configured.");
  }
  if (!(await canManageRooms())) {
    return failure("Room Finder management permission is required.");
  }

  let document: CampusIndoorDocument;
  try {
    document = parseCampusIndoorDocument(input.document);
  } catch {
    return failure("The indoor map document is not valid.");
  }

  const { data: mapData, error: mapError } = await loadCampusMapData();
  const building = mapData.places.find(
    (place) => place.id === buildingPlaceId && isBuildingPlace(place, mapData),
  );
  if (mapError || !building) {
    return failure("That published campus building could not be found.");
  }

  const buildingFeature = mapData.features.find(
    (feature) =>
      feature.featureKind === "building" &&
      feature.placeId === buildingPlaceId &&
      isCampusMapBuildingGeometry(feature.geometry),
  );
  if (
    !buildingFeature ||
    !isCampusMapBuildingGeometry(buildingFeature.geometry)
  ) {
    return failure("That building footprint could not be found.");
  }
  try {
    const footprint = projectBuildingFootprint(buildingFeature.geometry);
    if (!isIndoorDocumentWithinFootprint(document, footprint)) {
      return failure(
        "Keep every room, wall, path and connector inside the building outline.",
      );
    }
  } catch {
    return failure("That building footprint is not valid.");
  }

  try {
    const supabase = await createClient();
    const { data: current, error: currentError } = await supabase
      .from("campus_indoor_maps")
      .select("id,revision")
      .eq("building_place_id", buildingPlaceId)
      .maybeSingle();

    if (currentError) throw currentError;

    const publishedAt =
      input.status === "published" ? new Date().toISOString() : null;
    const storedDocument = document as unknown as Json;
    let savedRevision: number;

    if (current) {
      if (
        !Number.isSafeInteger(current.revision) ||
        current.revision < 1 ||
        current.revision >= 2_147_483_647
      ) {
        return failure("The indoor map revision is not valid.");
      }
      if (input.revision !== current.revision) {
        return failure(
          "This indoor map changed while you were editing. Reload it and try again.",
          current.revision,
        );
      }

      const nextRevision = current.revision + 1;
      const { data: updated, error: updateError } = await supabase
        .from("campus_indoor_maps")
        .update({
          document: storedDocument,
          name,
          published_at: publishedAt,
          revision: nextRevision,
          status: input.status,
        })
        .eq("id", current.id)
        .eq("revision", current.revision)
        .select("revision")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updated) {
        const { data: latest } = await supabase
          .from("campus_indoor_maps")
          .select("revision")
          .eq("building_place_id", buildingPlaceId)
          .maybeSingle();
        return failure(
          "This indoor map changed while you were editing. Reload it and try again.",
          latest?.revision ?? current.revision,
        );
      }
      savedRevision = updated.revision;
    } else {
      if (input.revision !== 0) {
        return failure(
          "This indoor map no longer exists at the revision you opened. Reload it and try again.",
        );
      }

      const { data: inserted, error: insertError } = await supabase
        .from("campus_indoor_maps")
        .insert({
          building_place_id: buildingPlaceId,
          document: storedDocument,
          name,
          published_at: publishedAt,
          revision: 1,
          status: input.status,
        })
        .select("revision")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505") {
          const { data: latest } = await supabase
            .from("campus_indoor_maps")
            .select("revision")
            .eq("building_place_id", buildingPlaceId)
            .maybeSingle();
          return failure(
            "This indoor map was created elsewhere. Reload it and try again.",
            latest?.revision ?? 0,
          );
        }
        throw insertError;
      }
      if (!inserted) throw new Error("The indoor map insert returned no row.");
      savedRevision = inserted.revision;
    }

    revalidatePublishedCampusMap();
    revalidatePath("/admin/rooms");
    revalidatePath("/rooms");

    return {
      ok: true,
      message:
        input.status === "published"
          ? "Indoor map published."
          : "Indoor map draft saved.",
      revision: savedRevision,
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    console.error("Indoor map save failed", {
      buildingPlaceId: input.buildingPlaceId,
      code,
    });
    if (
      code === "23514" &&
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      String(error.message).includes("campus_indoor_maps_document_check")
    ) {
      return failure(
        "The database rejected this map format. Your edits are still here. The indoor map database needs updating before you can save.",
      );
    }
    return failure(
      "The indoor map could not be saved. Your edits are still here. Please try again.",
    );
  }
}
