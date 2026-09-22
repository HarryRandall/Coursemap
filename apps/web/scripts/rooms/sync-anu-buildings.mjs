import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "prettier";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rawSnapshotPath = resolve(
  projectRoot,
  "scripts/fixtures/anu-acton-buildings-overpass.json",
);
const demoDataPath = resolve(projectRoot, "scripts/fixtures/campus-map.json");
const campusSourceIdentifier = "way/279984863";
const overpassUrl = "https://overpass-api.de/api/interpreter";
const sourceLicense = "OpenStreetMap contributors, ODbL 1.0";
const sourceProvider = "openstreetmap";
const falseBuildingValues = new Set(["0", "false", "no"]);
const buildingsLayerId = "10000000-0000-4000-8000-000000000001";
const campusId = "00000000-0000-4000-8000-000000000001";
const specialSlugs = new Set([
  "ad-hope-building",
  "beryl-rawson-building",
  "chifley-library",
  "marie-reay-teaching-centre",
  "student-hub-kambri",
]);
const specialSourceBySlug = new Map([
  ["ad-hope-building", "way/50632683"],
  ["beryl-rawson-building", "way/50632679"],
  ["chifley-library", "way/5001918"],
  ["marie-reay-teaching-centre", "way/674003253"],
]);

const overpassQuery = `[out:json][timeout:120];
way(279984863)->.campus;
.campus map_to_area -> .campusArea;
nwr["building"](area.campusArea);
out meta geom;`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceIdentifier(element) {
  return `${element.type}/${element.id}`;
}

function sourceUrl(element) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function isMappedBuilding(tags) {
  const building = String(tags?.building ?? "")
    .trim()
    .toLowerCase();
  return building !== "" && !falseBuildingValues.has(building);
}

function coordinatesEqual(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function closeRing(ring) {
  if (!coordinatesEqual(ring[0], ring.at(-1))) ring.push([...ring[0]]);
  return ring;
}

function geometryToSegment(geometry) {
  return geometry.map(({ lon, lat }) => [lon, lat]);
}

function joinSegmentsToRings(segments, relationId, role) {
  const remaining = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => segment.map((coordinate) => [...coordinate]));
  const rings = [];

  while (remaining.length > 0) {
    const ring = remaining.shift();
    while (!coordinatesEqual(ring[0], ring.at(-1))) {
      const end = ring.at(-1);
      const index = remaining.findIndex(
        (segment) =>
          coordinatesEqual(segment[0], end) ||
          coordinatesEqual(segment.at(-1), end),
      );
      assert(
        index >= 0,
        `Could not assemble ${role} ring for relation/${relationId}.`,
      );
      const [next] = remaining.splice(index, 1);
      if (coordinatesEqual(next.at(-1), end)) next.reverse();
      ring.push(...next.slice(1));
    }
    assert(ring.length >= 4, `relation/${relationId} has an invalid ring.`);
    rings.push(closeRing(ring));
  }

  return rings;
}

function pointInRing([longitude, latitude], ring) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    index += 1
  ) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude =
      currentLatitude > latitude !== previousLatitude > latitude;
    const crossingLongitude =
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;
    if (crossesLatitude && longitude < crossingLongitude) inside = !inside;
    previous = index;
  }
  return inside;
}

function polygonArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    twiceArea +=
      ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(twiceArea / 2);
}

function relationGeometry(element) {
  const outerSegments = element.members
    .filter(
      (member) =>
        (member.role === "outer" || member.role === "") && member.geometry,
    )
    .map((member) => geometryToSegment(member.geometry));
  const innerSegments = element.members
    .filter((member) => member.role === "inner" && member.geometry)
    .map((member) => geometryToSegment(member.geometry));
  const outerRings = joinSegmentsToRings(outerSegments, element.id, "outer");
  const innerRings = joinSegmentsToRings(innerSegments, element.id, "inner");
  assert(outerRings.length > 0, `relation/${element.id} has no outer ring.`);

  const polygons = outerRings.map((outer) => [outer]);
  for (const inner of innerRings) {
    const polygonIndex = outerRings.findIndex((outer) =>
      pointInRing(inner[0], outer),
    );
    assert(
      polygonIndex >= 0,
      `relation/${element.id} has an uncontained inner ring.`,
    );
    polygons[polygonIndex].push(inner);
  }

  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function wayGeometry(element) {
  assert(
    element.geometry?.length >= 4,
    `${sourceIdentifier(element)} is open.`,
  );
  const ring = closeRing(geometryToSegment(element.geometry));
  assert(
    coordinatesEqual(ring[0], ring.at(-1)),
    `${sourceIdentifier(element)} is open.`,
  );
  return { type: "Polygon", coordinates: [ring] };
}

function outerRings(geometry) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates[0]]
    : geometry.coordinates.map((polygon) => polygon[0]);
}

function pointInGeometry(point, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (polygon) =>
      pointInRing(point, polygon[0]) &&
      polygon.slice(1).every((hole) => !pointInRing(point, hole)),
  );
}

function polygonCentroid(ring) {
  let twiceArea = 0;
  let longitude = 0;
  let latitude = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const cross =
      ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    twiceArea += cross;
    longitude += (ring[index][0] + ring[index + 1][0]) * cross;
    latitude += (ring[index][1] + ring[index + 1][1]) * cross;
  }
  if (twiceArea === 0) return ring[0];
  return [longitude / (3 * twiceArea), latitude / (3 * twiceArea)];
}

function representativePoint(geometry) {
  const ring = outerRings(geometry).toSorted(
    (left, right) => polygonArea(right) - polygonArea(left),
  )[0];
  const centroid = polygonCentroid(ring);
  if (pointInGeometry(centroid, geometry)) return centroid;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const midpoint = [
      (ring[index][0] + centroid[0]) / 2,
      (ring[index][1] + centroid[1]) / 2,
    ];
    if (pointInGeometry(midpoint, geometry)) return midpoint;
  }
  return ring[0];
}

function parseMeasurement(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:m|metres?)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeBuildingHeights(tags) {
  const levels = parseMeasurement(tags["building:levels"]);
  const minimumLevels = parseMeasurement(tags["building:min_level"]);
  const explicitHeight = parseMeasurement(tags.height);
  const explicitMinimum = parseMeasurement(tags.min_height);
  const fallbackHeight = ["garage", "garages", "roof", "shed"].includes(
    tags.building,
  )
    ? 3
    : 5;
  const height = Math.max(
    0,
    explicitHeight ?? (levels === null ? fallbackHeight : levels * 3.66),
  );
  const minimum = Math.max(
    0,
    Math.min(
      height,
      explicitMinimum ?? (minimumLevels === null ? 0 : minimumLevels * 3.66),
    ),
  );
  return {
    heightMetres: Number(height.toFixed(2)),
    minimumHeightMetres: Number(minimum.toFixed(2)),
  };
}

function buildingName(element) {
  const tags = element.tags ?? {};
  return (
    tags.name ??
    tags.official_name ??
    tags.alt_name ??
    tags["addr:housename"] ??
    (tags.ref ? `Building ${tags.ref}` : null) ??
    `Unnamed ANU building (${element.type} ${element.id})`
  );
}

function buildingAddress(tags) {
  if (tags["addr:full"]) return tags["addr:full"];
  const streetAddress = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  return streetAddress || tags["addr:street"] || "ANU Acton campus";
}

function markerLabel(name, tags) {
  const reference = tags.ref ?? tags["building:ref"];
  if (reference) return String(reference).slice(0, 4).toUpperCase();
  const initials = name
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return initials || "ANU";
}

function selectedSourceProperties(tags) {
  const keys = [
    "addr:full",
    "addr:housename",
    "addr:housenumber",
    "addr:street",
    "alt_name",
    "building",
    "building:levels",
    "building:min_level",
    "height",
    "min_height",
    "name",
    "official_name",
    "ref",
    "roof:shape",
    "start_date",
  ];
  return Object.fromEntries(
    keys
      .filter((key) => tags[key] !== undefined)
      .map((key) => [key, tags[key]]),
  );
}

function searchTerms(element, name, address) {
  const tags = element.tags ?? {};
  return [
    name,
    address,
    sourceIdentifier(element),
    tags.alt_name,
    tags.official_name,
    tags["addr:housename"],
    tags.ref,
    tags["building:ref"],
    tags.building,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function stableUuid(namespace, value) {
  const bytes = createHash("sha256")
    .update(`${namespace}:${value}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildSnapshot(raw, baseDemo) {
  assert(raw?.overpass?.elements, "The Overpass snapshot is invalid.");
  const elements = raw.overpass.elements;
  const relationMemberWayIds = new Set(
    elements
      .filter((element) => element.type === "relation")
      .flatMap((element) => element.members ?? [])
      .filter((member) => member.type === "way")
      .map((member) => member.ref),
  );
  const polygonElements = elements.filter(
    (element) =>
      (element.type === "way" || element.type === "relation") &&
      isMappedBuilding(element.tags) &&
      !(element.type === "way" && relationMemberWayIds.has(element.id)),
  );
  const excludedNonBuildingSourceIdentifiers = elements
    .filter(
      (element) =>
        (element.type === "way" || element.type === "relation") &&
        !isMappedBuilding(element.tags),
    )
    .map(sourceIdentifier)
    .toSorted();
  const specialPlaces = new Map(
    baseDemo.places
      .filter((place) => specialSlugs.has(place.slug))
      .map((place) => [place.slug, place]),
  );
  const specialFeatures = new Map(
    baseDemo.features
      .filter((feature) => feature.featureKind === "building")
      .map((feature) => [feature.sourceIdentifier, feature]),
  );

  const parsed = polygonElements.map((element) => {
    const geometry =
      element.type === "way" ? wayGeometry(element) : relationGeometry(element);
    return { element, geometry, coordinates: representativePoint(geometry) };
  });

  const studentHub = specialPlaces.get("student-hub-kambri");
  if (studentHub) {
    const containing = parsed
      .filter(({ geometry }) =>
        pointInGeometry(studentHub.coordinates, geometry),
      )
      .toSorted(
        (left, right) =>
          polygonArea(outerRings(left.geometry)[0]) -
          polygonArea(outerRings(right.geometry)[0]),
      )[0];
    assert(
      containing,
      "Could not match Student Hub Kambri to an OSM footprint.",
    );
    specialSourceBySlug.set(
      "student-hub-kambri",
      sourceIdentifier(containing.element),
    );
  }
  const specialSlugBySource = new Map(
    [...specialSourceBySlug].map(([slug, identifier]) => [identifier, slug]),
  );

  const buildings = parsed
    .map(({ element, geometry, coordinates }) => {
      const identifier = sourceIdentifier(element);
      const specialSlug = specialSlugBySource.get(identifier);
      const existingPlace = specialSlug ? specialPlaces.get(specialSlug) : null;
      const tags = element.tags ?? {};
      const mappedName = buildingName(element);
      const mappedAddress = buildingAddress(tags);
      const name = existingPlace?.name ?? mappedName;
      const address = existingPlace?.address ?? mappedAddress;
      const url = sourceUrl(element);
      const version = Number.isInteger(element.version)
        ? element.version
        : null;
      const updatedAt =
        element.timestamp ?? raw.overpass.osm3s.timestamp_osm_base;
      const slug = existingPlace?.slug ?? `osm-${element.type}-${element.id}`;
      const placeId =
        existingPlace?.id ?? stableUuid("coursemap-anu-place", identifier);
      const existingFeature = specialFeatures.get(identifier);
      const featureId =
        existingFeature?.id ?? stableUuid("coursemap-anu-feature", identifier);
      const heights = safeBuildingHeights(tags);
      return {
        sourceIdentifier: identifier,
        sourceUrl: url,
        sourceVersion: version,
        sourceUpdatedAt: updatedAt,
        sourceProperties: selectedSourceProperties(tags),
        slug,
        name,
        markerLabel: existingPlace?.markerLabel ?? markerLabel(name, tags),
        address,
        coordinates: existingPlace?.coordinates ?? coordinates,
        officialUrl: existingPlace?.officialUrl ?? url,
        searchTerms: searchTerms(element, mappedName, mappedAddress),
        placeId,
        placeLayerId: existingPlace?.layerId ?? buildingsLayerId,
        placeDetails: existingPlace?.details ?? [],
        featureId,
        featureSlug:
          existingFeature?.slug ?? `osm-${element.type}-${element.id}`,
        geometry,
        ...heights,
      };
    })
    .toSorted(
      (left, right) =>
        left.name.localeCompare(right.name, "en-AU") ||
        left.sourceIdentifier.localeCompare(right.sourceIdentifier),
    )
    .map((building, index) => ({ ...building, sortOrder: (index + 1) * 10 }));

  assert(
    buildings.length >= 250,
    `Expected at least 250 polygonal buildings, received ${buildings.length}.`,
  );
  assert(
    new Set(buildings.map((building) => building.sourceIdentifier)).size ===
      buildings.length,
    "Building source identifiers are not unique.",
  );
  assert(
    [...specialSlugs].every((slug) =>
      buildings.some((building) => building.slug === slug),
    ),
    "At least one curated Room Finder place was not matched to a footprint.",
  );

  const sourceHash = createHash("sha256")
    .update(JSON.stringify(raw.overpass.elements))
    .digest("hex");
  return {
    metadata: {
      campusSourceIdentifier,
      sourceProvider,
      sourceLicense,
      sourceUrl: raw.sourceUrl,
      sourceTimestamp: raw.overpass.osm3s.timestamp_osm_base,
      sourceHash,
      rawElementCount: elements.length,
      skippedNodeCount: elements.filter((element) => element.type === "node")
        .length,
      buildingCount: buildings.length,
      namedSourceCount: elements.filter((element) => element.tags?.name).length,
      excludedNonBuildingSourceIdentifiers,
    },
    buildings,
  };
}

function toDemoData(baseDemo, snapshot) {
  const walkingFeatures = baseDemo.features.filter(
    (feature) => feature.featureKind === "walking_path",
  );
  const places = snapshot.buildings.map((building) => ({
    id: building.placeId,
    layerId: building.placeLayerId,
    slug: building.slug,
    name: building.name,
    markerLabel: building.markerLabel,
    address: building.address,
    coordinates: building.coordinates,
    officialUrl: building.officialUrl,
    dataStatus: "mapped",
    mapDisplayKind: "building",
    isRoutable: true,
    sortOrder: building.sortOrder,
    searchTerms: building.searchTerms,
    sourceProvider,
    sourceIdentifier: building.sourceIdentifier,
    sourceUrl: building.sourceUrl,
    sourceLicense,
    sourceVersion: building.sourceVersion,
    sourceUpdatedAt: building.sourceUpdatedAt,
    details: building.placeDetails,
  }));
  const features = snapshot.buildings.map((building) => ({
    id: building.featureId,
    campusId,
    layerId: buildingsLayerId,
    placeId: building.placeId,
    slug: building.featureSlug,
    name: building.name,
    featureKind: "building",
    geometry: building.geometry,
    sourceIdentifier: building.sourceIdentifier,
    sourceUrl: building.sourceUrl,
    sourceLicense,
    sourceProperties: building.sourceProperties,
    heightMetres: building.heightMetres,
    minimumHeightMetres: building.minimumHeightMetres,
    sortOrder: building.sortOrder,
  }));
  const layers = baseDemo.layers.map((layer) =>
    layer.slug === "buildings"
      ? {
          ...layer,
          description:
            "All mapped ANU Acton building footprints. Surrounding buildings remain flat for context.",
          styleLayerPatterns: ["building", "coursemap-anu-buildings-3d"],
        }
      : layer,
  );
  return {
    campus: baseDemo.campus,
    layers,
    places,
    features: [...features, ...walkingFeatures],
    // Indoor maps are demo fixture data, unrelated to the building import, so
    // a resync carries them through rather than dropping them.
    ...(baseDemo.indoorMaps ? { indoorMaps: baseDemo.indoorMaps } : {}),
    snapshot: snapshot.metadata,
  };
}

function sqlString(value) {
  return value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

function migrationSql(snapshot) {
  const payload = JSON.stringify(snapshot);
  return `begin;

do $validation$
declare
  payload jsonb := $snapshot$${payload}$snapshot$::jsonb;
begin
  if (payload #>> '{metadata,campusSourceIdentifier}') <> '${campusSourceIdentifier}' then
    raise exception 'Unexpected ANU campus boundary source.';
  end if;
  if (payload #>> '{metadata,sourceHash}') <> '${snapshot.metadata.sourceHash}' then
    raise exception 'Unexpected ANU building snapshot hash.';
  end if;
  if jsonb_array_length(payload -> 'buildings') <> ${snapshot.metadata.buildingCount} then
    raise exception 'Incomplete ANU building snapshot.';
  end if;
end
$validation$;

create temporary table anu_building_import on commit drop as
select *
from jsonb_to_recordset(
  ($snapshot$${payload}$snapshot$::jsonb) -> 'buildings'
) as building (
  "sourceIdentifier" text,
  "sourceUrl" text,
  "sourceVersion" bigint,
  "sourceUpdatedAt" timestamptz,
  "sourceProperties" jsonb,
  slug text,
  name text,
  "markerLabel" text,
  address text,
  coordinates jsonb,
  "officialUrl" text,
  "searchTerms" jsonb,
  "placeId" uuid,
  "placeLayerId" uuid,
  "featureId" uuid,
  "featureSlug" text,
  geometry jsonb,
  "heightMetres" double precision,
  "minimumHeightMetres" double precision,
  "sortOrder" integer
);

create temporary table anu_non_building_exclusion on commit drop as
select excluded.source_identifier
from jsonb_array_elements_text(
  ($snapshot$${payload}$snapshot$::jsonb)
    #> '{metadata,excludedNonBuildingSourceIdentifiers}'
) as excluded(source_identifier);

delete from public.campus_map_features as features
using anu_non_building_exclusion as excluded,
  public.campus_map_places as places
where features.campus_id = '${campusId}'
  and features.layer_id = '${buildingsLayerId}'
  and features.place_id = places.id
  and features.feature_kind = 'building'
  and features.source_license = ${sqlString(sourceLicense)}
  and features.source_identifier = excluded.source_identifier
  and places.layer_id = '${buildingsLayerId}'
  and places.map_display_kind = 'building'
  and places.source_provider = '${sourceProvider}'
  and places.source_identifier = excluded.source_identifier
  and places.data_status <> 'verified';

delete from public.campus_map_places as places
using anu_non_building_exclusion as excluded
where places.layer_id = '${buildingsLayerId}'
  and places.map_display_kind = 'building'
  and places.source_provider = '${sourceProvider}'
  and places.source_identifier = excluded.source_identifier
  and places.data_status <> 'verified'
  and not exists (
    select 1
    from public.campus_map_features as remaining_features
    where remaining_features.place_id = places.id
  );

update public.campus_map_places as places
set
  source_provider = '${sourceProvider}',
  source_identifier = imported."sourceIdentifier",
  source_url = imported."sourceUrl",
  source_license = ${sqlString(sourceLicense)},
  source_version = imported."sourceVersion",
  source_updated_at = imported."sourceUpdatedAt",
  search_terms = array(
    select jsonb_array_elements_text(imported."searchTerms")
  ),
  data_status = case
    when places.data_status = 'verified' then places.data_status
    else 'mapped'
  end
from anu_building_import as imported
where places.slug = imported.slug
  and places.id = imported."placeId";

insert into public.campus_map_places as places (
  id,
  layer_id,
  slug,
  name,
  marker_label,
  address,
  longitude,
  latitude,
  official_url,
  data_status,
  map_display_kind,
  is_routable,
  status,
  sort_order,
  search_terms,
  source_provider,
  source_identifier,
  source_url,
  source_license,
  source_version,
  source_updated_at
)
select
  imported."placeId",
  imported."placeLayerId",
  imported.slug,
  imported.name,
  imported."markerLabel",
  imported.address,
  (imported.coordinates ->> 0)::double precision,
  (imported.coordinates ->> 1)::double precision,
  imported."officialUrl",
  'mapped',
  'building',
  true,
  'published',
  imported."sortOrder",
  array(select jsonb_array_elements_text(imported."searchTerms")),
  '${sourceProvider}',
  imported."sourceIdentifier",
  imported."sourceUrl",
  ${sqlString(sourceLicense)},
  imported."sourceVersion",
  imported."sourceUpdatedAt"
from anu_building_import as imported
on conflict (source_provider, source_identifier)
where source_provider is not null and source_identifier is not null
do update set
  address = case
    when places.data_status = 'verified' then places.address
    else excluded.address
  end,
  data_status = case
    when places.data_status = 'verified' then places.data_status
    else excluded.data_status
  end,
  latitude = case
    when places.data_status = 'verified' then places.latitude
    else excluded.latitude
  end,
  longitude = case
    when places.data_status = 'verified' then places.longitude
    else excluded.longitude
  end,
  marker_label = case
    when places.data_status = 'verified' then places.marker_label
    else excluded.marker_label
  end,
  name = case
    when places.data_status = 'verified' then places.name
    else excluded.name
  end,
  official_url = coalesce(places.official_url, excluded.official_url),
  search_terms = excluded.search_terms,
  source_license = excluded.source_license,
  source_updated_at = excluded.source_updated_at,
  source_url = excluded.source_url,
  source_version = excluded.source_version,
  status = 'published';

insert into public.campus_map_features as features (
  id,
  campus_id,
  layer_id,
  place_id,
  slug,
  name,
  feature_kind,
  geometry_geojson,
  source_identifier,
  source_url,
  source_license,
  status,
  sort_order,
  height_metres,
  minimum_height_metres,
  source_properties
)
select
  imported."featureId",
  '${campusId}',
  '${buildingsLayerId}',
  places.id,
  imported."featureSlug",
  imported.name,
  'building',
  imported.geometry,
  imported."sourceIdentifier",
  imported."sourceUrl",
  ${sqlString(sourceLicense)},
  'published',
  imported."sortOrder",
  imported."heightMetres",
  imported."minimumHeightMetres",
  imported."sourceProperties"
from anu_building_import as imported
join public.campus_map_places as places
  on places.source_provider = '${sourceProvider}'
  and places.source_identifier = imported."sourceIdentifier"
on conflict (source_license, source_identifier)
do update set
  campus_id = excluded.campus_id,
  geometry_geojson = excluded.geometry_geojson,
  height_metres = excluded.height_metres,
  layer_id = excluded.layer_id,
  minimum_height_metres = excluded.minimum_height_metres,
  name = excluded.name,
  place_id = excluded.place_id,
  source_properties = excluded.source_properties,
  source_url = excluded.source_url,
  sort_order = excluded.sort_order,
  status = 'published'
where not exists (
  select 1
  from public.campus_map_places as protected_places
  where protected_places.data_status = 'verified'
    and protected_places.id in (features.place_id, excluded.place_id)
);

comment on table public.campus_map_places is
  'Searchable Room Finder places, including the mapped ANU Acton building directory.';

commit;
`;
}

async function fetchSnapshot() {
  const response = await fetch(overpassUrl, {
    method: "POST",
    body: new URLSearchParams({ data: overpassQuery }),
    headers: {
      Accept: "application/json",
      "User-Agent": "Coursemap ANU building snapshot importer",
    },
    signal: AbortSignal.timeout(150_000),
  });
  assert(response.ok, `Overpass returned HTTP ${response.status}.`);
  const overpass = await response.json();
  const raw = {
    sourceUrl: overpassUrl,
    query: overpassQuery,
    overpass,
  };
  await writeFile(
    rawSnapshotPath,
    await format(JSON.stringify(raw), { parser: "json" }),
  );
  console.log(
    `Saved ${overpass.elements.length} elements to ${rawSnapshotPath}.`,
  );
}

function migrationOutputPath(filename) {
  assert(
    /^\d{14}_import_anu_acton_buildings\.sql$/.test(filename),
    "Use a timestamped ANU building import migration filename.",
  );
  return resolve(projectRoot, "../../supabase/migrations", filename);
}

async function readExistingFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * The first import of these buildings was squashed into the schema baseline,
 * so there is no longer a file for this script to regenerate in place. A run
 * names the forward migration it is writing, which is the only safe way to
 * change data the hosted project already holds.
 */
async function generate(migrationFilename) {
  assert(
    migrationFilename,
    "Name the forward migration to write, for example 20261001090000_import_anu_acton_buildings.sql.",
  );
  const [raw, baseDemo] = await Promise.all([
    readFile(rawSnapshotPath, "utf8").then(JSON.parse),
    readFile(demoDataPath, "utf8").then(JSON.parse),
  ]);
  const snapshot = buildSnapshot(raw, baseDemo);
  const demoData = toDemoData(baseDemo, snapshot);
  const formattedDemoData = await format(JSON.stringify(demoData), {
    parser: "json",
  });
  const generatedMigration = migrationSql(snapshot);
  const outputPath = migrationOutputPath(migrationFilename);
  const existingMigration = await readExistingFile(outputPath);
  assert(
    existingMigration === null || existingMigration === generatedMigration,
    `Refusing to rewrite ${migrationFilename}. Generate a new forward migration by passing a new timestamped filename.`,
  );

  const writes = [writeFile(demoDataPath, formattedDemoData)];
  if (existingMigration === null) {
    writes.push(writeFile(outputPath, generatedMigration));
  }
  await Promise.all(writes);
  console.log(
    `Generated ${snapshot.metadata.buildingCount} building places and footprints.`,
  );
  console.log(`Snapshot SHA-256: ${snapshot.metadata.sourceHash}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2] ?? "generate";
  if (command === "fetch") await fetchSnapshot();
  else if (command === "generate") await generate(process.argv[3]);
  else throw new Error(`Unknown command: ${command}`);
}

export {
  buildSnapshot,
  buildingAddress,
  buildingName,
  isMappedBuilding,
  migrationOutputPath,
  migrationSql,
  overpassQuery,
  relationGeometry,
  safeBuildingHeights,
  sourceIdentifier,
  stableUuid,
  toDemoData,
};
