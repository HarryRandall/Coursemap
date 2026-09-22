import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
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
} from "../scripts/rooms/sync-anu-buildings.mjs";

const [raw, demo, baseline] = await Promise.all([
  readFile(
    new URL(
      "../scripts/fixtures/anu-acton-buildings-overpass.json",
      import.meta.url,
    ),
    "utf8",
  ).then(JSON.parse),
  readFile(
    new URL("../scripts/fixtures/campus-map.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(
    new URL("../../../supabase/migrations/006_campus.sql", import.meta.url),
    "utf8",
  ),
]);

/**
 * What a fresh run of the importer would write. The committed campus data was
 * squashed into the baseline, so the generated SQL is no longer a file to
 * compare against byte for byte; it is still the thing every assertion about
 * the importer's output is really about.
 */
const generated = migrationSql(buildSnapshot(raw, demo));

test("builds a complete deterministic ANU Acton building snapshot", () => {
  const snapshot = buildSnapshot(raw, demo);

  assert.equal(snapshot.metadata.rawElementCount, 288);
  assert.equal(snapshot.metadata.skippedNodeCount, 2);
  assert.equal(snapshot.metadata.buildingCount, 282);
  assert.equal(snapshot.metadata.namedSourceCount, 207);
  assert.deepEqual(snapshot.metadata.excludedNonBuildingSourceIdentifiers, [
    "way/673823968",
  ]);
  assert.match(snapshot.metadata.sourceHash, /^[0-9a-f]{64}$/);
  assert.equal(
    new Set(snapshot.buildings.map((building) => building.sourceIdentifier))
      .size,
    snapshot.buildings.length,
  );
  assert.equal(
    snapshot.buildings.find(
      (building) => building.slug === "student-hub-kambri",
    )?.sourceIdentifier,
    "way/672271093",
  );
  assert.deepEqual(demo.snapshot, snapshot.metadata);
  assert.deepEqual(toDemoData(demo, snapshot), demo);
  // The baseline carries the result of this import rather than the import
  // itself, so it is checked for the buildings rather than for the statements.
  assert.equal(
    (baseline.match(/INSERT INTO public\.campus_map_places /g) ?? []).length,
    snapshot.buildings.length,
  );
  for (const building of snapshot.buildings) {
    assert.ok(
      baseline.includes(`'${building.sourceIdentifier}'`),
      `${building.sourceIdentifier} is missing from the campus baseline.`,
    );
  }
});

test("requires future snapshots to use a new forward migration", () => {
  assert.match(
    migrationOutputPath("20260829090000_import_anu_acton_buildings.sql"),
    /supabase\/migrations\/20260829090000_import_anu_acton_buildings\.sql$/,
  );
  assert.throws(
    () => migrationOutputPath("../rewrite_existing_migration.sql"),
    /timestamped ANU building import migration filename/,
  );
  assert.match(
    generated,
    /when places\.data_status = 'verified' then places\.latitude/,
  );
});

test("uses honest names and addresses when OpenStreetMap tags are sparse", () => {
  const element = { type: "way", id: 42, tags: { building: "yes" } };
  assert.equal(buildingName(element), "Unnamed ANU building (way 42)");
  assert.equal(buildingAddress(element.tags), "ANU Acton campus");
  assert.equal(sourceIdentifier(element), "way/42");

  assert.equal(
    buildingAddress({
      "addr:housenumber": "10",
      "addr:street": "University Avenue",
    }),
    "10 University Avenue",
  );
});

test("excludes false OpenStreetMap building tags", () => {
  assert.match(overpassQuery, /nwr\["building"\]\(area\.campusArea\)/);
  assert.doesNotMatch(overpassQuery, /building"!="no/);
  assert.equal(isMappedBuilding({ building: "university" }), true);
  assert.equal(isMappedBuilding({ building: "yes" }), true);
  assert.equal(isMappedBuilding({ building: "no" }), false);
  assert.equal(isMappedBuilding({ building: "false" }), false);
  assert.equal(isMappedBuilding({ building: "0" }), false);
  assert.equal(isMappedBuilding({}), false);
});

test("scopes exclusions and preserves verified map data", () => {
  assert.match(
    generated,
    /where features\.campus_id = '00000000-0000-4000-8000-000000000001'/,
  );
  assert.match(
    generated,
    /and features\.layer_id = '10000000-0000-4000-8000-000000000001'/,
  );
  assert.match(generated, /and places\.map_display_kind = 'building'/);
  assert.match(generated, /and places\.data_status <> 'verified'/);
  assert.match(generated, /where remaining_features\.place_id = places\.id/);
  assert.match(generated, /where protected_places\.data_status = 'verified'/);
});

test("derives safe building heights without allowing inverted bases", () => {
  assert.deepEqual(safeBuildingHeights({ "building:levels": "4" }), {
    heightMetres: 14.64,
    minimumHeightMetres: 0,
  });
  assert.deepEqual(safeBuildingHeights({ height: "7 m", min_height: "12" }), {
    heightMetres: 7,
    minimumHeightMetres: 7,
  });
  assert.deepEqual(safeBuildingHeights({ building: "shed" }), {
    heightMetres: 3,
    minimumHeightMetres: 0,
  });
});

test("assembles relation members into a multipolygon", () => {
  const geometry = relationGeometry({
    id: 7,
    members: [
      {
        type: "way",
        role: "outer",
        geometry: [
          { lon: 149.1, lat: -35.2 },
          { lon: 149.2, lat: -35.2 },
          { lon: 149.2, lat: -35.3 },
          { lon: 149.1, lat: -35.3 },
          { lon: 149.1, lat: -35.2 },
        ],
      },
      {
        type: "way",
        role: "outer",
        geometry: [
          { lon: 149.3, lat: -35.2 },
          { lon: 149.4, lat: -35.2 },
          { lon: 149.4, lat: -35.3 },
          { lon: 149.3, lat: -35.3 },
          { lon: 149.3, lat: -35.2 },
        ],
      },
    ],
  });

  assert.equal(geometry.type, "MultiPolygon");
  assert.equal(geometry.coordinates.length, 2);
});

test("generates stable source-derived UUIDs", () => {
  const first = stableUuid("place", "way/42");
  assert.equal(first, stableUuid("place", "way/42"));
  assert.notEqual(first, stableUuid("feature", "way/42"));
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
