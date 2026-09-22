import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const modules = {
  "campus-map": await import("../lib/rooms/campus-map.ts"),
  "campus-map-query": await import("../lib/rooms/campus-map-query.ts"),
  "campus-map-images": await import("../lib/rooms/campus-map-images.ts"),
  "indoor-map": await import("../lib/rooms/indoor-map.ts"),
  "indoor-geometry": await import("../lib/rooms/indoor-geometry.ts"),
  routing: await import("../lib/rooms/routing.ts"),
};
const campusMap = modules["campus-map"];
const campusMapQuery = modules["campus-map-query"];
const indoorMap = modules["indoor-map"];
const routing = modules["routing"];

const demoData = JSON.parse(
  await readFile(
    new URL("../scripts/fixtures/campus-map.json", import.meta.url),
    "utf8",
  ),
);
const visibleLayers = campusMap.getDefaultVisibleLayerSlugs(demoData.layers);

const indoorDocument = {
  version: 2,
  viewBox: { width: 1000, height: 700 },
  walls: [],
  levels: [
    {
      id: "level-ground",
      number: 0,
      ref: "G",
      name: "Ground floor",
      elevationMetres: 0,
      heightMetres: 3.6,
      outline: [
        { x: 50, y: 50 },
        { x: 950, y: 50 },
        { x: 950, y: 650 },
        { x: 50, y: 650 },
      ],
    },
  ],
  spaces: [
    {
      id: "room-g02",
      levelId: "level-ground",
      kind: "room",
      ref: "G02",
      name: "Round room",
      searchable: true,
      geometry: { type: "ellipse", cx: 650, cy: 250, rx: 100, ry: 80 },
    },
    {
      id: "room-g01",
      levelId: "level-ground",
      kind: "room",
      ref: "G01",
      name: "Seminar room",
      searchable: true,
      geometry: {
        type: "polygon",
        points: [
          { x: 100, y: 100 },
          { x: 400, y: 100 },
          { x: 420, y: 280 },
          { x: 100, y: 280 },
        ],
      },
    },
  ],
  connectors: [],
  routeNodes: [],
  routeEdges: [],
};

test("validates and lists searchable multi-shape indoor rooms", () => {
  const parsed = indoorMap.parseCampusIndoorDocument(indoorDocument);
  assert.ok(
    !("routingMode" in parsed),
    "a stored routing mode is accepted and discarded",
  );
  assert.equal(parsed.levels[0].ref, "G");
  assert.deepEqual(
    indoorMap.listIndoorRoomDetails(parsed).map((room) => room.label),
    ["Seminar room", "Round room"],
  );
});

test("rejects invalid indoor geometry and unknown level references", () => {
  assert.throws(
    () =>
      indoorMap.parseCampusIndoorDocument({
        ...indoorDocument,
        spaces: [
          {
            ...indoorDocument.spaces[0],
            levelId: "missing-level",
          },
        ],
      }),
    /unknown level identifier/u,
  );
  assert.throws(
    () =>
      indoorMap.parseCampusIndoorDocument({
        ...indoorDocument,
        spaces: [
          {
            ...indoorDocument.spaces[1],
            geometry: {
              type: "polygon",
              points: [
                { x: 100, y: 100 },
                { x: 300, y: 300 },
                { x: 100, y: 300 },
                { x: 300, y: 100 },
              ],
            },
          },
        ],
      }),
    /simple polygon/u,
  );
});
/**
 * A two level explicit document: a ground room and an upper room joined by a
 * lift, with the walking segments an author would draw on each level.
 */
function twoLevelExplicitDocument(liftAccessibility = "accessible") {
  const upperLevel = {
    ...indoorDocument.levels[0],
    id: "level-one",
    number: 1,
    ref: "1",
    name: "Level 1",
    elevationMetres: 3.6,
  };
  const upperRoom = {
    ...indoorDocument.spaces[0],
    id: "room-101",
    levelId: upperLevel.id,
    ref: "1.01",
    name: "Upper room",
  };
  const lift = {
    id: "main-lift",
    kind: "lift",
    name: "Main lift",
    levelIds: ["level-ground", "level-one"],
    position: { x: 500, y: 400 },
    accessibility: liftAccessibility,
  };
  const groundLiftNodeId = indoorMap.indoorConnectorRouteNodeId(
    lift.id,
    "level-ground",
  );
  const upperLiftNodeId = indoorMap.indoorConnectorRouteNodeId(
    lift.id,
    "level-one",
  );
  const explicitDocument = {
    ...indoorDocument,
    levels: [...indoorDocument.levels, upperLevel],
    spaces: [indoorDocument.spaces[1], upperRoom],
    connectors: [lift],
    routeNodes: [
      {
        id: "door-ground",
        levelId: "level-ground",
        kind: "door",
        position: { x: 420, y: 250 },
        spaceId: "room-g01",
        accessibility: "accessible",
      },
      {
        id: "junction-ground",
        levelId: "level-ground",
        kind: "junction",
        position: { x: 460, y: 400 },
      },
      {
        id: "junction-upper",
        levelId: "level-one",
        kind: "junction",
        position: { x: 540, y: 400 },
      },
      {
        id: "door-upper",
        levelId: "level-one",
        kind: "door",
        position: { x: 550, y: 250 },
        spaceId: "room-101",
        accessibility: "accessible",
      },
    ],
    routeEdges: [
      {
        id: "ground-door-path",
        fromNodeId: "door-ground",
        toNodeId: "junction-ground",
        kind: "walking",
        bidirectional: true,
        distanceMetres: 15.5,
        accessibility: "accessible",
      },
      {
        id: "ground-lift-path",
        fromNodeId: "junction-ground",
        toNodeId: groundLiftNodeId,
        kind: "walking",
        bidirectional: true,
        distanceMetres: 4,
        accessibility: "accessible",
      },
      {
        id: "upper-lift-path",
        fromNodeId: upperLiftNodeId,
        toNodeId: "junction-upper",
        kind: "walking",
        bidirectional: true,
        distanceMetres: 4,
        accessibility: "accessible",
      },
      {
        id: "upper-door-path",
        fromNodeId: "junction-upper",
        toNodeId: "door-upper",
        kind: "walking",
        bidirectional: true,
        distanceMetres: 15,
        accessibility: "accessible",
      },
    ],
  };

  return { explicitDocument, groundLiftNodeId, upperLiftNodeId };
}

test("blocks an accessible route through an inaccessible connector", () => {
  const { explicitDocument } = twoLevelExplicitDocument("inaccessible");
  const routed = indoorMap.buildIndoorRouteGraph(explicitDocument);

  assert.deepEqual(
    indoorMap.buildIndoorRouteGraph(routed).routeNodes,
    routed.routeNodes,
    "rebuilding an already routed document must be a no-op",
  );
  assert.ok(
    indoorMap.findIndoorRoute(routed, "room-g01", "room-101"),
    "the lift is still the only way between the levels",
  );
  assert.equal(
    indoorMap.findIndoorRoute(routed, "room-g01", "room-101", {
      accessibleOnly: true,
    }),
    null,
  );
});

test("routes explicit paths through room doors without centre shortcuts", () => {
  const explicitDocument = {
    ...indoorDocument,
    routeNodes: [
      {
        id: "door-g01",
        levelId: "level-ground",
        kind: "door",
        position: { x: 420, y: 250 },
        spaceId: "room-g01",
        accessibility: "accessible",
      },
      {
        id: "path-left",
        levelId: "level-ground",
        kind: "junction",
        position: { x: 450, y: 400 },
      },
      {
        id: "path-right",
        levelId: "level-ground",
        kind: "junction",
        position: { x: 550, y: 400 },
      },
      {
        id: "door-g02",
        levelId: "level-ground",
        kind: "door",
        position: { x: 550, y: 250 },
        spaceId: "room-g02",
        accessibility: "accessible",
      },
    ],
    routeEdges: [
      {
        id: "path-g01",
        fromNodeId: "door-g01",
        toNodeId: "path-left",
        kind: "walking",
        bidirectional: true,
        distanceMetres: 15.3,
        accessibility: "accessible",
      },
      {
        id: "path-centre",
        fromNodeId: "path-left",
        toNodeId: "path-right",
        kind: "walking",
        bidirectional: true,
        distanceMetres: 10,
        accessibility: "accessible",
      },
      {
        id: "path-g02",
        fromNodeId: "path-right",
        toNodeId: "door-g02",
        kind: "walking",
        bidirectional: true,
        distanceMetres: 15,
        accessibility: "accessible",
      },
    ],
  };

  const routed = indoorMap.buildIndoorRouteGraph(explicitDocument);
  const rebuilt = indoorMap.buildIndoorRouteGraph(routed);
  assert.deepEqual(rebuilt.routeNodes, routed.routeNodes);
  assert.deepEqual(rebuilt.routeEdges, routed.routeEdges);
  assert.deepEqual(
    [...indoorMap.indoorAuthoredRouteEdgeIds(routed)].sort(),
    ["path-centre", "path-g01", "path-g02"],
    "generated room-entry links stay out of the editor drawing",
  );
  assert.doesNotMatch(
    routed.routeEdges.map((edge) => edge.id).join(" "),
    /walking-\d/u,
  );

  const route = indoorMap.findIndoorRoute(routed, "room-g01", "room-g02", {
    accessibleOnly: true,
  });
  assert.ok(route);
  assert.deepEqual(route.nodeIds, [
    indoorMap.indoorSpaceRouteNodeId("room-g01"),
    "door-g01",
    "path-left",
    "path-right",
    "door-g02",
    indoorMap.indoorSpaceRouteNodeId("room-g02"),
  ]);
  assert.deepEqual(route.edgeIds, [
    "room-entry-door-g01",
    "path-g01",
    "path-centre",
    "path-g02",
    "room-entry-door-g02",
  ]);

  const disconnected = indoorMap.buildIndoorRouteGraph({
    ...explicitDocument,
    routeEdges: explicitDocument.routeEdges.filter(
      (edge) => edge.id !== "path-centre",
    ),
  });
  assert.equal(
    indoorMap.findIndoorRoute(disconnected, "room-g01", "room-g02"),
    null,
  );

  const inaccessibleDoor = indoorMap.buildIndoorRouteGraph({
    ...explicitDocument,
    routeNodes: explicitDocument.routeNodes.map((node) =>
      node.id === "door-g02"
        ? { ...node, accessibility: "inaccessible" }
        : node,
    ),
  });
  assert.equal(
    indoorMap.findIndoorRoute(inaccessibleDoor, "room-g01", "room-g02", {
      accessibleOnly: true,
    }),
    null,
  );
});
test("keeps explicit paths connected through multi-level connectors", () => {
  const { explicitDocument, groundLiftNodeId, upperLiftNodeId } =
    twoLevelExplicitDocument();

  const routed = indoorMap.buildIndoorRouteGraph(explicitDocument);
  const route = indoorMap.findIndoorRoute(routed, "room-g01", "room-101", {
    accessibleOnly: true,
  });
  assert.ok(route);
  assert.deepEqual(route.levelIds, ["level-ground", "level-one"]);
  assert.ok(route.nodeIds.includes(groundLiftNodeId));
  assert.ok(route.nodeIds.includes(upperLiftNodeId));
  assert.equal(
    route.edgeIds.filter((edgeId) => edgeId.startsWith("vertical-")).length,
    1,
  );
  assert.deepEqual(
    indoorMap.buildIndoorRouteGraph(routed).routeEdges,
    routed.routeEdges,
  );
});
test("validates explicit room route-node relationships", () => {
  assert.throws(
    () =>
      indoorMap.parseCampusIndoorDocument({
        ...indoorDocument,
        routeNodes: [
          {
            id: "missing-room-door",
            levelId: "level-ground",
            kind: "door",
            position: { x: 420, y: 250 },
          },
        ],
      }),
    /required for a door route node/u,
  );
  assert.throws(
    () =>
      indoorMap.parseCampusIndoorDocument({
        ...indoorDocument,
        routeNodes: [
          {
            id: "wrong-room-door",
            levelId: "level-ground",
            kind: "door",
            position: { x: 420, y: 250 },
            spaceId: "missing-room",
          },
        ],
      }),
    /unknown space identifier/u,
  );
});

test("batches large campus map queries below URL limits", () => {
  const placeIds = Array.from({ length: 283 }, (_, index) => `place-${index}`);
  const batches = campusMapQuery.batchCampusMapQueryValues(placeIds);

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [75, 75, 75, 58],
  );
  assert.deepEqual(batches.flat(), placeIds);
  assert.deepEqual(campusMapQuery.batchCampusMapQueryValues([]), []);
  assert.throws(
    () => campusMapQuery.batchCampusMapQueryValues(placeIds, 0),
    /positive integer/u,
  );
});

test("copies both MapLibre worker modules for Next builds", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const workerScript = await readFile(
    new URL("../scripts/copy-maplibre-worker.mjs", import.meta.url),
    "utf8",
  );
  const mapComponent = await readFile(
    new URL("../ui/rooms/campus-map.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    packageJson.scripts.predev,
    "node scripts/copy-maplibre-worker.mjs",
  );
  assert.equal(
    packageJson.scripts.prebuild,
    "node scripts/copy-maplibre-worker.mjs",
  );
  assert.match(workerScript, /maplibre-gl-worker\.mjs/);
  assert.match(workerScript, /maplibre-gl-shared\.mjs/);
  assert.match(
    mapComponent,
    /setWorkerUrl\("\/maplibre\/maplibre-gl-worker\.mjs"\)/,
  );
});

test("filters dynamic places by layer, address and detail", () => {
  assert.deepEqual(
    campusMap
      .filterCampusPlaces(
        demoData.places,
        demoData.layers,
        visibleLayers,
        "Marie Reay",
      )
      .map((place) => place.slug),
    ["marie-reay-teaching-centre"],
  );
  assert.deepEqual(
    campusMap
      .filterCampusPlaces(
        demoData.places,
        demoData.layers,
        visibleLayers,
        "Ellery 1.23",
      )
      .map((place) => place.slug),
    ["ad-hope-building"],
  );
  assert.deepEqual(
    campusMap
      .filterCampusPlaces(
        demoData.places,
        demoData.layers,
        new Set(["study-spaces"]),
        "study",
      )
      .map((place) => place.slug),
    ["chifley-library"],
  );
});

test("filters mapped buildings by imported aliases and building numbers", () => {
  const place = {
    ...demoData.places[0],
    searchTerms: ["Building 101", "Old Administration Block"],
  };

  assert.deepEqual(
    campusMap
      .filterCampusPlaces([place], demoData.layers, visibleLayers, "old 101")
      .map((candidate) => candidate.slug),
    [place.slug],
  );
});

test("finds places and honours layer visibility", () => {
  assert.equal(
    campusMap.findCampusPlace(demoData.places, "beryl-rawson-building")?.name,
    "Beryl Rawson Building",
  );
  assert.equal(
    campusMap.findCampusPlace(demoData.places, "missing"),
    undefined,
  );
  assert.equal(
    campusMap.filterCampusPlaces(
      demoData.places,
      demoData.layers,
      new Set(["student-services"]),
      "",
    ).length,
    1,
  );
});

test("supplies dynamic map layers and preserves imported feature provenance", () => {
  assert.equal(demoData.layers.length, 13);
  const buildingFeatures = demoData.features.filter(
    (feature) => feature.featureKind === "building",
  );
  assert.ok(buildingFeatures.length > 250);
  assert.equal(buildingFeatures.length, demoData.places.length);
  assert.equal(
    demoData.features.filter(
      (feature) => feature.featureKind === "walking_path",
    ).length,
    3,
  );
  assert.ok(campusMap.isCampusMapPolygon(demoData.campus.boundary));
  assert.equal(
    demoData.campus.initialZoom - demoData.campus.minZoom,
    3,
    "the campus preview allows exactly three zoom-out steps",
  );
  for (const feature of demoData.features) {
    assert.match(feature.sourceIdentifier, /^(?:way|relation)\/\d+$/);
    assert.match(
      feature.sourceUrl,
      /^https:\/\/www\.openstreetmap\.org\/(?:way|relation)\//,
    );
  }
});

test("maps OpenFreeMap style layers into independently toggleable groups", () => {
  const layerBySlug = new Map(
    demoData.layers.map((layer) => [layer.slug, layer]),
  );
  const buildings = layerBySlug.get("buildings");
  const roads = layerBySlug.get("roads");
  const paths = layerBySlug.get("walking-paths");
  const terrain = layerBySlug.get("terrain");

  assert.ok(campusMap.isMapStyleLayer(buildings));
  assert.ok(campusMap.isMapStyleLayer(roads));
  assert.ok(campusMap.isPlaceFilterLayer(layerBySlug.get("study-spaces")));
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(buildings, "building-3d"),
    false,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(
      buildings,
      "coursemap-anu-buildings-3d",
    ),
    true,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(roads, "road_minor"),
    true,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(roads, "road_path_pedestrian"),
    false,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(
      paths,
      "bridge_path_pedestrian_casing",
    ),
    true,
  );
  assert.equal(
    campusMap.getControlledStyleLayerVisibility(
      "coursemap-terrain-hillshade",
      demoData.layers,
      new Set([terrain.slug]),
    ),
    "visible",
  );
  assert.equal(
    campusMap.getControlledStyleLayerVisibility(
      "coursemap-terrain-hillshade",
      demoData.layers,
      new Set(),
    ),
    "none",
  );
  assert.equal(
    campusMap.getControlledStyleLayerVisibility(
      "uncontrolled-style-layer",
      demoData.layers,
      new Set(),
    ),
    null,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(
      layerBySlug.get("points-of-interest"),
      "poi_z16",
    ),
    true,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(
      layerBySlug.get("place-labels"),
      "label_city",
    ),
    true,
  );
  assert.equal(
    campusMap.campusLayerControlsStyleLayer(
      layerBySlug.get("road-and-water-names"),
      "highway-name-major",
    ),
    true,
  );
});

test("links every building place to a stored building footprint", () => {
  const buildingPlaces = demoData.places.filter(
    (place) => place.mapDisplayKind === "building",
  );
  assert.ok(buildingPlaces.length > 250);
  assert.equal(
    demoData.places.filter((place) => place.mapDisplayKind === "point").length,
    0,
  );
  assert.equal(
    demoData.features.filter(
      (feature) =>
        feature.featureKind === "building" &&
        buildingPlaces.some((place) => place.id === feature.placeId),
    ).length,
    buildingPlaces.length,
  );

  const marieReayFeature = demoData.features.find(
    (feature) => feature.slug === "marie-reay-building-outline",
  );
  assert.ok(marieReayFeature);
  assert.equal(
    campusMap.isCoordinateNearBuildingGeometry(
      buildingPlaces.find(
        (place) => place.slug === "marie-reay-teaching-centre",
      ).coordinates,
      marieReayFeature.geometry,
    ),
    true,
  );
});

test("accepts Polygon and MultiPolygon building footprints", () => {
  assert.equal(
    campusMap.isCampusMapBuildingGeometry({
      type: "Polygon",
      coordinates: [
        [
          [149.12, -35.28],
          [149.13, -35.28],
          [149.13, -35.27],
          [149.12, -35.28],
        ],
      ],
    }),
    true,
  );
  assert.equal(
    campusMap.isCampusMapBuildingGeometry({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [149.12, -35.28],
            [149.13, -35.28],
            [149.13, -35.27],
            [149.12, -35.28],
          ],
        ],
        [
          [
            [149.14, -35.28],
            [149.15, -35.28],
            [149.15, -35.27],
            [149.14, -35.28],
          ],
        ],
      ],
    }),
    true,
  );
  assert.equal(
    campusMap.isCampusMapBuildingGeometry({
      type: "MultiPolygon",
      coordinates: [],
    }),
    false,
  );
});

test("renders only stored ANU buildings in 3D", async () => {
  const mapComponent = await readFile(
    new URL("../ui/rooms/campus-map.tsx", import.meta.url),
    "utf8",
  );
  const roomFinder = await readFile(
    new URL("../ui/rooms/room-finder.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(mapComponent, /setTerrain/);
  assert.match(mapComponent, /type: "hillshade"/);
  assert.match(mapComponent, /dragRotate: true/);
  assert.match(mapComponent, /maxPitch: 65/);
  assert.match(mapComponent, /coursemap-anu-buildings/);
  assert.match(mapComponent, /buildAnuBuildingCollection/);
  assert.match(mapComponent, /features\.filter\(isStoredBuildingFeature\)/);
  assert.match(mapComponent, /setLayerZoomRange/);
  assert.match(mapComponent, /NATIVE_BUILDING_MAX_ZOOM = 24/);
  assert.match(mapComponent, /isNativeBuildingExtrusionLayer/);
  assert.match(mapComponent, /minimumHeightMetres/);
  assert.match(mapComponent, /getBuildingFeaturesForPlace/);
  assert.match(roomFinder, /features=\{data\.features\}/);
  assert.match(mapComponent, /type: "fill-extrusion"/);
  assert.match(mapComponent, /"fill-extrusion-opacity": 0\.88/);
  assert.doesNotMatch(mapComponent, /"fill-extrusion-opacity": \[/);
  assert.match(mapComponent, /coursemap-selected-anu-building-3d/);
  assert.match(
    mapComponent,
    /selected: feature\.placeId === highlights\.selectedPlaceId/,
  );
  assert.match(mapComponent, /filter: \["!=", \["get", "selected"\], true\]/);
  assert.match(mapComponent, /filter: \["==", \["get", "selected"\], true\]/);
  assert.match(
    mapComponent,
    /setPaintProperty\(\s*SELECTED_ANU_BUILDING_LAYER_ID,\s*"fill-extrusion-opacity"/,
  );
  assert.match(
    mapComponent,
    /const visibleIndoorScene = visibleLayerSlugs\.has/,
  );
  assert.match(mapComponent, /function getMapSelectionHitAtPoint/);
  assert.match(
    mapComponent,
    /queryRenderedFeatures\(point, \{ layers: \[\.\.\.INDOOR_LAYER_ID_LIST\] \}\)/,
  );
  assert.match(mapComponent, /selectionHit\?\.kind === "indoor"/);
  assert.match(mapComponent, /const explicitFocus =/);
  assert.match(
    mapComponent,
    /indoorScene && indoorScene\.slabs\.features\.length > 0/,
  );
  assert.match(mapComponent, /const focusKey = \[/);
  assert.match(mapComponent, /focus\?\.requestKey \?\? ""/);
  assert.match(mapComponent, /focusedPlaceKeyRef\.current === focusKey/);
  assert.match(
    mapComponent,
    /routeEndpoints\.to\.slug === indoorFocus\.placeSlug/,
  );
  assert.match(
    mapComponent,
    /: \{ pitch: CAMPUS_PITCH, bearing: CAMPUS_BEARING \}/,
  );
  assert.match(roomFinder, /const buildingsVisible = visibleLayerSlugs\.has/);
  assert.match(
    roomFinder,
    /indoorScene=\{buildingsVisible \? indoorScene : null\}/,
  );
  assert.match(
    roomFinder,
    /buildingsVisible && indoorScene && indoorLevels\.length > 0/,
  );
  assert.match(roomFinder, /const selectedIndoorDocument = useMemo/);
  assert.match(roomFinder, /remapIndoorDocumentToFootprint\(/);
  assert.match(roomFinder, /buildIndoorRouteGraph\(alignedDocument\)/);
  assert.match(
    roomFinder,
    /buildIndoorScene\(selectedIndoorDocument, selectedFootprint/,
  );
  assert.doesNotMatch(
    mapComponent,
    /setPaintProperty\(\s*ANU_BUILDING_LAYER_ID,\s*"fill-extrusion-opacity"/,
  );
  assert.match(mapComponent, /coursemap-selected-building-label/);
  assert.match(mapComponent, /type: "symbol"/);
  assert.match(mapComponent, /"text-field": \["get", "name"\]/);
  assert.match(mapComponent, /syncSelectedBuildingLabel\(/);
  assert.match(
    mapComponent,
    /selectedFeatures\.length > 0 \? selectedPlace : null/,
  );
  assert.match(mapComponent, /onClearSelectionRef\.current\(\)/);
  assert.doesNotMatch(mapComponent, /markerLabel/);
  assert.doesNotMatch(mapComponent, /feature-state/);
  assert.doesNotMatch(
    mapComponent,
    /createPlaceMarker|createEndpointMarker|room-map-marker|room-route-endpoint/,
  );
  assert.doesNotMatch(mapComponent, /campus-features|campus-mask/);
});

test("lists a selected building's rooms and turns a room into the destination", async () => {
  const roomFinder = await readFile(
    new URL("../ui/rooms/room-finder.tsx", import.meta.url),
    "utf8",
  );

  assert.match(roomFinder, /room\.buildingPlaceId === selectedPlace\.id/);
  assert.match(roomFinder, /Rooms in \{selectedPlace\?\.name\}/);
  assert.match(
    roomFinder,
    /Choose a findable room to use it as your destination/,
  );
  assert.match(roomFinder, /setDirectionsOpen\(true\)/);
  assert.match(roomFinder, /fromSlug === room\.buildingSlug/);
  assert.match(roomFinder, /setFromSlug\(nextFromSlug\)/);
  assert.match(roomFinder, /setToSlug\(room\.buildingSlug\)/);
  assert.match(roomFinder, /destinationOptions\.map\(/);
  assert.match(roomFinder, /<IndoorDirections/);
  assert.match(roomFinder, /journey\.steps\.map/);
  assert.match(roomFinder, /onShowLevel=\{showIndoorLevel\}/);
  assert.match(roomFinder, /requestKey: indoorFocusRequest/);
  assert.match(roomFinder, /aria-label=\{`Show \$\{level\.name\}`\}/);
  assert.match(roomFinder, /min-h-11 min-w-11/);
  assert.match(roomFinder, /initialRoomBuilding \?\?/);
});

test("the indoor editor is split into a picker, a shared canvas and pure modules", async () => {
  const read = (path) =>
    readFile(new URL(`../${path}`, import.meta.url), "utf8");

  const [mapComponent, picker, editor, surface, indoorLayers] =
    await Promise.all([
      read("ui/rooms/campus-map.tsx"),
      read("ui/admin/rooms/building-picker.tsx"),
      read("ui/admin/rooms/indoor-editor.tsx"),
      read("ui/admin/rooms/indoor-map-surface.tsx"),
      read("ui/rooms/indoor-3d-layers.ts"),
    ]);

  assert.match(
    mapComponent,
    /focusedPlaceKeyRef = useRef<string \| null>\(null\)/,
  );
  assert.match(mapComponent, /addIndoorLayers\(map, firstLabelLayer\)/);
  assert.match(
    mapComponent,
    /map\.moveLayer\(\s*SELECTED_ANU_BUILDING_LAYER_ID,\s*INDOOR_LAYER_IDS\.labels/,
  );

  // The picker is a map plus a search, not a list of every building.
  assert.match(picker, /<CampusMap/);
  assert.match(picker, /router\.push\(`\/admin\/rooms\//);
  assert.doesNotMatch(picker, /Published ANU buildings/);

  // Editing runs through the shared canvas and the pure modules, so nothing is
  // drawn or dragged twice.
  assert.match(editor, /<IndoorMapSurface/);
  assert.match(editor, /routingSignature\(document\)/);
  assert.match(editor, /buildIndoorScene\(/);
  assert.match(
    editor,
    /indoorAuthoredRouteEdgeIds\(document\)[\s\S]*routeEdgeIds: authoredRouteEdgeIds/,
  );
  // Rooms are drawn on the real building, so the surface has to convert
  // between map coordinates and the units a document is authored in.
  assert.match(surface, /projectIndoorPoint\(/);
  assert.match(surface, /queryRenderedFeatures\(/);
  assert.match(surface, /INDOOR_PICKABLE_LAYER_ID_LIST[\s\S]*?\]\.filter/);
  assert.match(surface, /map\.getLayer\(layerId\)/);
  assert.match(
    surface,
    /kind: "space" \| "wall" \| "opening" \| "connector" \| "route-node"/,
  );
  assert.match(surface, /typeof properties\.openingId === "string"/);
  assert.match(
    surface,
    /pick\(\s*\{ kind: "opening", id: properties\.openingId \}/,
  );
  assert.match(surface, /typeof properties\.routeNodeId === "string"/);
  assert.match(
    surface,
    /pick\(\s*\{ kind: "route-node", id: properties\.routeNodeId \}/,
  );
  assert.match(
    indoorLayers,
    /INDOOR_PICKABLE_LAYER_ID_LIST = \[[\s\S]*INDOOR_LAYER_IDS\.route,/,
  );
  // The canvas is painted from the resolved theme palette, never from
  // hardcoded hex, so dark mode gets a usable plan.
  assert.match(surface, /function editorMapStyle\(/);
  assert.match(surface, /sources: \{\}/);
  assert.match(surface, /coursemap-indoor-editor-background/);
  assert.match(surface, /"background-color": palette\.background/);
  assert.match(surface, /applyIndoorPalette\(map, palette\)/);
  assert.doesNotMatch(surface, /#[0-9a-f]{6}\b/i);
  assert.doesNotMatch(indoorLayers, /#[0-9a-f]{6}\b/i);
  assert.match(indoorLayers, /export function applyIndoorPalette/);
  assert.doesNotMatch(surface, /NEXT_PUBLIC_ROOM_MAP_STYLE_URL/);
  assert.match(surface, /const canvas = map\.getCanvas\(\)/);
  assert.match(editor, /onPick=\{handlePick\}/);
  assert.match(editor, /return remapIndoorDocumentToFootprint\(/);
  assert.match(surface, /const EDITOR_MAX_ZOOM = 22/);
  assert.match(surface, /cameraForBounds\(/);
  assert.match(surface, /camera\.zoom - EDITOR_ZOOM_OUT_LEVELS/);
  assert.match(surface, /setMinZoom\(minimumZoom\)/);
  assert.match(surface, /setMaxBounds\(\[/);
  assert.match(surface, /const observer = new ResizeObserver/);
  assert.match(
    surface,
    /const pitch = perspective \? PERSPECTIVE_PITCH : PLAN_PITCH/,
  );
  assert.doesNotMatch(surface, /map\.fitBounds\(/);
  // One canvas: the 2D/3D toggle explodes the floors and rests the tools.
  assert.match(editor, /showInactiveLevels: perspective/);
  assert.match(editor, /explode: perspective \? 2\.25 : 1/);
  assert.match(editor, /editingEnabled = !perspective/);
  assert.match(
    editor,
    /drawing=\{[\s\S]*editingEnabled &&\s*\(tool !== "select" \|\| pointer.drag.kind !== "idle"\)/,
  );
  assert.match(editor, /pointer\.cancel\(\);\s*setTool\("select"\)/);

  // The breadcrumb owns the building identity; a tool rail, a floating floor
  // pill and a right-hand inspector replace the old section tabs.
  assert.match(editor, /currentBreadcrumbLabel=\{building\.name\}/);
  assert.match(editor, /<EditorActions/);
  assert.match(editor, /<ToolRail/);
  assert.match(editor, /<LevelPill/);
  assert.match(editor, /<Inspector/);
  assert.match(editor, /<CanvasControls/);
  assert.match(editor, /<EditorHint/);
  assert.match(editor, /footer=\{canvasControls\}/);
  assert.doesNotMatch(editor, /<EditorStatusBar/);
  assert.match(editor, /useIndoorPalette\(rootRef\)/);
  assert.doesNotMatch(
    editor,
    /<Tabs|<FloorsPanel|<SelectionDetailsSheet|<footer|<FloorsRail|<PropertiesPanel/,
  );

  // Features that were removed must not creep back.
  for (const source of [picker, editor, surface]) {
    assert.doesNotMatch(
      source,
      /Import SVG|Start mapping paths|Use building footprint|routingMode|MAXIMUM_ZOOM = 16/,
    );
  }
});

test("validates every saved indoor element against its building footprint", async () => {
  const admin = await readFile(
    new URL("../lib/rooms/indoor-map-admin.ts", import.meta.url),
    "utf8",
  );

  assert.match(admin, /projectBuildingFootprint\(buildingFeature\.geometry\)/);
  assert.match(admin, /isIndoorDocumentWithinFootprint\(document, footprint\)/);
  assert.match(
    admin,
    /Keep every room, wall, path and connector inside the building outline\./,
  );
});

test("keeps draft indoor previews permission-scoped in the public room finder", async () => {
  const [page, loader, migration] = await Promise.all([
    readFile(new URL("../app/rooms/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/rooms/campus-map-data.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../supabase/migrations/006_campus.sql", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    page,
    /loadCampusMapData\(\{ includeManageableDrafts: true \}\)/,
  );
  assert.match(loader, /includeManageableDrafts\s*\? await createClient\(\)/);
  assert.match(loader, /const publicSupabase = createPublicClient\(\)/);
  assert.match(loader, /const query = indoorSupabase/);
  assert.match(loader, /const campusResult = await publicSupabase/);
  assert.match(loader, /query\.in\("status", \["published", "draft"\]\)/);
  assert.match(loader, /query\.eq\("status", "published"\)/);
  assert.match(
    migration,
    /campus_indoor_maps_read_authenticated[\s\S]*private\.has_permission\('rooms\.manage'(?:::text)?\)/,
  );
});

test("uses fixed-opacity sibling layers for indoor floor emphasis", async () => {
  const indoorLayers = await readFile(
    new URL("../ui/rooms/indoor-3d-layers.ts", import.meta.url),
    "utf8",
  );

  const extrusionOpacities = [
    ...indoorLayers.matchAll(/"fill-extrusion-opacity": ([^,\n]+)/gu),
  ];
  assert.ok(extrusionOpacities.length >= 14);
  for (const [, opacity] of extrusionOpacities) {
    assert.match(opacity.trim(), /^(?:0(?:\.\d+)?|1)$/u);
  }
  assert.doesNotMatch(indoorLayers, /"fill-extrusion-opacity": \[/u);
  assert.match(indoorLayers, /slabsInactive/);
  assert.match(indoorLayers, /roomsInactive/);
  assert.match(indoorLayers, /perimeters/);
  assert.match(indoorLayers, /perimetersInactive/);
  assert.match(indoorLayers, /wallsInactive/);
  assert.match(indoorLayers, /openingsInactive/);
  assert.match(indoorLayers, /INDOOR_LAYER_IDS\.openings,/);
  assert.match(indoorLayers, /INDOOR_SOURCE_IDS\.openings/);
  assert.match(indoorLayers, /connectorsRoute/);
  assert.match(indoorLayers, /routeInactive/);
  assert.match(indoorLayers, /labelsInactive/);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.1,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.2,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.28,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.35,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.12,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.24,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.98,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.48,/u);
  assert.match(indoorLayers, /"fill-extrusion-opacity": 0\.32,/u);
  assert.match(indoorLayers, /\["get", "exterior"\]/u);
  assert.match(indoorLayers, /"text-font": \["Noto Sans Regular"\]/u);
  assert.match(
    indoorLayers,
    /source: INDOOR_SOURCE_IDS\.labels,\s*[^]*?filter: \["==", \["get", "active"\], true\]/u,
  );
  assert.doesNotMatch(
    indoorLayers,
    /"text-opacity": \["case", \["get", "active"\]/u,
  );
  assert.match(indoorLayers, /"text-opacity": 0\.48,/u);
  assert.doesNotMatch(indoorLayers, /"text-allow-overlap": true,/u);
  assert.doesNotMatch(indoorLayers, /"text-ignore-placement": true,/u);
  assert.match(indoorLayers, /filter: \["==", \["get", "active"\], false\]/u);
  assert.match(indoorLayers, /filter: \["==", \["get", "active"\], true\]/u);
  assert.match(indoorLayers, /\["==", \["get", "perimeter"\], true\]/u);
  assert.match(indoorLayers, /\["!=", \["get", "perimeter"\], true\]/u);
  assert.match(indoorLayers, /map\.moveLayer\(layerId, insertionPoint\)/u);
  const drawOrder = indoorLayers.slice(
    indoorLayers.indexOf("const INDOOR_LAYER_DRAW_ORDER"),
    indoorLayers.indexOf("export function addIndoorLayers"),
  );
  assert.ok(
    drawOrder.indexOf("INDOOR_LAYER_IDS.route,") <
      drawOrder.indexOf("INDOOR_LAYER_IDS.slabsInactive"),
  );
  assert.ok(
    drawOrder.indexOf("INDOOR_LAYER_IDS.slabsInactive") <
      drawOrder.indexOf("INDOOR_LAYER_IDS.roomsInactive"),
  );
  assert.ok(
    drawOrder.indexOf("INDOOR_LAYER_IDS.roomsInactive") <
      drawOrder.indexOf("INDOOR_LAYER_IDS.openingsInactive"),
  );
  assert.ok(
    drawOrder.indexOf("INDOOR_LAYER_IDS.openingsInactive") <
      drawOrder.indexOf("INDOOR_LAYER_IDS.labelsInactive"),
  );
  assert.ok(
    drawOrder.indexOf("INDOOR_LAYER_IDS.labelsInactive") <
      drawOrder.indexOf("INDOOR_LAYER_IDS.labels,"),
  );
});

test("builds an HTTPS walking route request for the selected places", () => {
  const from = demoData.places[0];
  const to = demoData.places[1];
  const routeUrl = routing.buildWalkingRouteUrl(
    from,
    to,
    "https://routing.example.test/foot/route/v1/driving",
  );
  const [fromLongitude, fromLatitude] = from.coordinates;
  const [toLongitude, toLatitude] = to.coordinates;

  assert.equal(routeUrl.protocol, "https:");
  assert.equal(
    routeUrl.pathname,
    `/foot/route/v1/driving/${fromLongitude},${fromLatitude};${toLongitude},${toLatitude}`,
  );
  assert.equal(routeUrl.searchParams.get("geometries"), "geojson");
  assert.throws(
    () =>
      routing.buildWalkingRouteUrl(
        from,
        to,
        "http://routing.example.test/route",
      ),
    /must use HTTPS/,
  );
});

test("accepts usable walking routes and rejects malformed responses", () => {
  assert.deepEqual(
    routing.parseWalkingRouteResponse({
      routes: [
        {
          distance: 410.4,
          duration: 322.1,
          geometry: {
            coordinates: [
              [149.12, -35.27],
              [149.13, -35.28],
            ],
          },
        },
      ],
    }),
    {
      coordinates: [
        [149.12, -35.27],
        [149.13, -35.28],
      ],
      distanceMetres: 410.4,
      durationSeconds: 322.1,
    },
  );
  assert.equal(routing.parseWalkingRouteResponse({ routes: [] }), null);
});

test("missing basemap icons reuse sprite symbols and preserve their pixel metadata", () => {
  const image = {
    data: { width: 2, height: 2, data: new Uint8Array(16) },
    pixelRatio: 2,
    sdf: true,
  };
  const images = new Map(
    [
      "building",
      "roadblock",
      "waste_basket",
      "bicycle",
      "entrance",
      "parking",
      "bank",
      "stadium",
      "swimming",
      "circle",
    ].map((id) => [id, image]),
  );
  const added = new Map();
  const map = {
    hasImage: (id) => images.has(id) || added.has(id),
    getImage: (id) => images.get(id),
    addImage: (id, data, options) => added.set(id, { data, options }),
  };
  const resolve = modules["campus-map-images"].resolveCampusMapImage;
  for (const id of [
    "office",
    "bollard",
    "recycling",
    "bicycle_parking",
    "gate",
    "motorcycle_parking",
    "atm",
    "sports_centre",
    "swimming_pool",
    "cycle_barrier",
    "athletics",
    "lift_gate",
    "unrecognised-poi",
  ]) {
    resolve(map, id);
    assert.equal(added.get(id).data, image.data);
    assert.equal(added.get(id).options.pixelRatio, 2);
    assert.equal(added.get(id).options.sdf, true);
  }
  resolve(map, "building");
  assert.equal(added.has("building"), false);
  resolve(map, "office");
  assert.equal(added.size, 13);
  // Do not hide a broken custom sprite with an invisible placeholder.
  images.clear();
  resolve(map, "custom-pattern");
  assert.equal(added.has("custom-pattern"), false);
});
