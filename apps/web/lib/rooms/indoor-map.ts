import { indoorGeometryCentre } from "@/lib/rooms/indoor-geometry";
import {
  openingPoint,
  wallSegmentCount,
  wallSegmentLength,
  wallSegments,
} from "@/lib/rooms/indoor-walls";

export const CAMPUS_INDOOR_DOCUMENT_VERSION = 2 as const;

export type IndoorAccessibility = "unknown" | "accessible" | "inaccessible";

export type IndoorPoint = Readonly<{
  x: number;
  y: number;
}>;

export type CampusIndoorViewBox = Readonly<{
  width: number;
  height: number;
}>;

export type CampusIndoorLevel = Readonly<{
  id: string;
  number: number;
  ref: string;
  name: string;
  elevationMetres: number;
  heightMetres: number;
  outline: readonly IndoorPoint[];
}>;

export type IndoorRectangleGeometry = Readonly<{
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}>;

export type IndoorEllipseGeometry = Readonly<{
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}>;

export type IndoorPolygonGeometry = Readonly<{
  type: "polygon";
  points: readonly IndoorPoint[];
}>;

export type IndoorSpaceGeometry =
  IndoorRectangleGeometry | IndoorEllipseGeometry | IndoorPolygonGeometry;

export type IndoorSpaceKind =
  "room" | "corridor" | "open-area" | "service" | "void";

export type CampusIndoorSpace = Readonly<{
  id: string;
  levelId: string;
  kind: IndoorSpaceKind;
  ref: string;
  name: string;
  searchable: boolean;
  geometry: IndoorSpaceGeometry;
}>;

export type IndoorWallKind = "structural" | "partition" | "glazing";

/**
 * A hole an author cut through a wall. A door route node is derived from one of
 * these rather than authored loose, so a route can only cross a wall where a
 * gap was actually drawn.
 */
export type CampusIndoorWallOpening = Readonly<{
  id: string;
  /** A doorless gap is still an opening a route may pass through. */
  kind: "door" | "opening";
  /** Index of the wall segment this opening sits on. */
  segmentIndex: number;
  /** Position of the opening centre along that segment, from 0 to 1. */
  offset: number;
  /** Clear width in local units. */
  width: number;
  accessibility: IndoorAccessibility;
  /**
   * The room this opening serves. Derived from the wall normal at draw time and
   * then stored, so an author can correct it and nothing depends on re-running
   * the inference.
   */
  spaceId?: string;
  /** Set when the opening leads outside, making it a building entrance. */
  exterior?: boolean;
}>;

/**
 * A drawn wall run. Walls are polylines rather than one record per segment so a
 * perimeter or corridor selects, moves and reshapes as the single thing an
 * author drew, and so mitred corners fall out of one stroked path.
 */
export type CampusIndoorWall = Readonly<{
  id: string;
  levelId: string;
  kind: IndoorWallKind;
  points: readonly IndoorPoint[];
  /** Wall thickness in local units, at ten units per metre. */
  thickness: number;
  closed: boolean;
  openings: readonly CampusIndoorWallOpening[];
}>;

export type IndoorConnectorKind = "stairs" | "lift" | "escalator" | "ramp";

export type CampusIndoorConnector = Readonly<{
  id: string;
  kind: IndoorConnectorKind;
  name: string;
  levelIds: readonly string[];
  position: IndoorPoint;
  accessibility: IndoorAccessibility;
}>;

export type IndoorRouteNodeKind =
  "entrance" | "door" | "junction" | "connector" | "space";

export type CampusIndoorRouteNode = Readonly<{
  id: string;
  levelId: string;
  kind: IndoorRouteNodeKind;
  position: IndoorPoint;
  connectorId?: string;
  spaceId?: string;
  /** Set on door and entrance nodes derived from a wall opening. */
  openingId?: string;
  accessibility?: IndoorAccessibility;
}>;

export type IndoorRouteEdgeKind =
  "walking" | "stairs" | "lift" | "escalator" | "ramp";

export type CampusIndoorRouteEdge = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: IndoorRouteEdgeKind;
  bidirectional: boolean;
  distanceMetres: number;
  accessibility: IndoorAccessibility;
}>;

export type CampusIndoorDocument = Readonly<{
  version: typeof CAMPUS_INDOOR_DOCUMENT_VERSION;
  viewBox: CampusIndoorViewBox;
  levels: readonly CampusIndoorLevel[];
  walls: readonly CampusIndoorWall[];
  spaces: readonly CampusIndoorSpace[];
  connectors: readonly CampusIndoorConnector[];
  routeNodes: readonly CampusIndoorRouteNode[];
  routeEdges: readonly CampusIndoorRouteEdge[];
}>;

export type IndoorRoomDetail = Readonly<{
  id: string;
  spaceId: string;
  levelId: string;
  levelNumber: number;
  levelRef: string;
  levelName: string;
  ref: string;
  name: string;
  label: string;
  geometry: IndoorSpaceGeometry;
}>;

export type IndoorRouteOptions = Readonly<{
  accessibleOnly?: boolean;
}>;

export type CampusIndoorRoute = Readonly<{
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  levelIds: readonly string[];
  distanceMetres: number;
}>;

const DEFAULT_CAMPUS_INDOOR_VIEW_BOX: CampusIndoorViewBox = {
  width: 1000,
  height: 1000,
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/;
const MAX_IDENTIFIER_LENGTH = 128;
export const INDOOR_METRES_PER_LOCAL_UNIT = 0.1;
const MINIMUM_ROUTE_DISTANCE_METRES = 0.01;
const MINIMUM_WALL_THICKNESS = 0.1;
const MAXIMUM_WALL_THICKNESS = 100;
const MINIMUM_WALL_SEGMENT_LENGTH = 1;
const MAXIMUM_WALL_POINTS = 500;

type UnknownRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasExactKeys(
  record: UnknownRecord,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Object.keys(record);
  return (
    requiredKeys.every((key) => hasOwn(record, key)) &&
    keys.every((key) => allowedKeys.has(key))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pointsEqual(left: IndoorPoint, right: IndoorPoint) {
  return left.x === right.x && left.y === right.y;
}

function normalisePolygonPoints(points: readonly IndoorPoint[]) {
  if (points.length > 3 && pointsEqual(points[0], points.at(-1)!)) {
    return points.slice(0, -1);
  }
  return points;
}

function crossProduct(
  start: IndoorPoint,
  middle: IndoorPoint,
  end: IndoorPoint,
) {
  return (
    (middle.x - start.x) * (end.y - start.y) -
    (middle.y - start.y) * (end.x - start.x)
  );
}

function pointIsOnSegment(
  point: IndoorPoint,
  start: IndoorPoint,
  end: IndoorPoint,
) {
  return (
    crossProduct(start, end, point) === 0 &&
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y)
  );
}

function segmentsIntersect(
  firstStart: IndoorPoint,
  firstEnd: IndoorPoint,
  secondStart: IndoorPoint,
  secondEnd: IndoorPoint,
) {
  const firstStartSide = crossProduct(firstStart, firstEnd, secondStart);
  const firstEndSide = crossProduct(firstStart, firstEnd, secondEnd);
  const secondStartSide = crossProduct(secondStart, secondEnd, firstStart);
  const secondEndSide = crossProduct(secondStart, secondEnd, firstEnd);

  if (
    ((firstStartSide > 0 && firstEndSide < 0) ||
      (firstStartSide < 0 && firstEndSide > 0)) &&
    ((secondStartSide > 0 && secondEndSide < 0) ||
      (secondStartSide < 0 && secondEndSide > 0))
  ) {
    return true;
  }

  return (
    (firstStartSide === 0 &&
      pointIsOnSegment(secondStart, firstStart, firstEnd)) ||
    (firstEndSide === 0 && pointIsOnSegment(secondEnd, firstStart, firstEnd)) ||
    (secondStartSide === 0 &&
      pointIsOnSegment(firstStart, secondStart, secondEnd)) ||
    (secondEndSide === 0 && pointIsOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function hasSelfIntersection(points: readonly IndoorPoint[]) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex++) {
    const firstNextIndex = (firstIndex + 1) % points.length;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < points.length;
      secondIndex++
    ) {
      const secondNextIndex = (secondIndex + 1) % points.length;
      const segmentsAreAdjacent =
        firstIndex === secondIndex ||
        firstNextIndex === secondIndex ||
        secondNextIndex === firstIndex;
      if (segmentsAreAdjacent) continue;

      if (
        segmentsIntersect(
          points[firstIndex],
          points[firstNextIndex],
          points[secondIndex],
          points[secondNextIndex],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function polygonArea(points: readonly IndoorPoint[]) {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const nextPoint = points[(index + 1) % points.length];
      return sum + point.x * nextPoint.y - nextPoint.x * point.y;
    }, 0) / 2,
  );
}

export function isIndoorPoint(value: unknown): value is IndoorPoint {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["x", "y"]) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

export function isValidIndoorPolygonPoints(
  value: unknown,
): value is readonly IndoorPoint[] {
  if (
    !Array.isArray(value) ||
    value.length < 3 ||
    !value.every(isIndoorPoint)
  ) {
    return false;
  }

  const points = normalisePolygonPoints(value);
  if (points.length < 3) return false;
  if (
    points.some((point, index) =>
      pointsEqual(point, points[(index + 1) % points.length]),
    )
  ) {
    return false;
  }

  return polygonArea(points) > 0 && !hasSelfIntersection(points);
}

export function isIndoorPointWithinViewBox(
  point: IndoorPoint,
  viewBox: CampusIndoorViewBox,
) {
  return (
    point.x >= 0 &&
    point.x <= viewBox.width &&
    point.y >= 0 &&
    point.y <= viewBox.height
  );
}

export function isIndoorGeometryWithinViewBox(
  geometry: IndoorSpaceGeometry,
  viewBox: CampusIndoorViewBox,
) {
  if (geometry.type === "rectangle") {
    return (
      geometry.x >= 0 &&
      geometry.y >= 0 &&
      geometry.x + geometry.width <= viewBox.width &&
      geometry.y + geometry.height <= viewBox.height
    );
  }

  if (geometry.type === "ellipse") {
    return (
      geometry.cx - geometry.rx >= 0 &&
      geometry.cy - geometry.ry >= 0 &&
      geometry.cx + geometry.rx <= viewBox.width &&
      geometry.cy + geometry.ry <= viewBox.height
    );
  }

  return geometry.points.every((point) =>
    isIndoorPointWithinViewBox(point, viewBox),
  );
}

function invalid(path: string, message: string): never {
  throw new TypeError(`Invalid campus indoor document at ${path}: ${message}`);
}

function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!isPlainRecord(value)) invalid(path, "expected a plain object");
  return value;
}

function expectExactKeys(
  record: UnknownRecord,
  requiredKeys: readonly string[],
  path: string,
  optionalKeys: readonly string[] = [],
) {
  const missing = requiredKeys.filter((key) => !hasOwn(record, key));
  if (missing.length > 0) {
    invalid(path, `missing ${missing.map((key) => `'${key}'`).join(", ")}`);
  }

  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    invalid(
      path,
      `unexpected ${unexpected.map((key) => `'${key}'`).join(", ")}`,
    );
  }
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "expected an array");
  return value;
}

function expectString(value: unknown, path: string) {
  if (typeof value !== "string") invalid(path, "expected a string");
  return value;
}

function expectIdentifier(value: unknown, path: string) {
  const identifier = expectString(value, path);
  if (
    identifier.length > MAX_IDENTIFIER_LENGTH ||
    !IDENTIFIER_PATTERN.test(identifier)
  ) {
    invalid(
      path,
      "expected a non-empty identifier containing only letters, numbers, '.', '_', ':' or '-'",
    );
  }
  return identifier;
}

function expectNumber(value: unknown, path: string) {
  if (!isFiniteNumber(value)) invalid(path, "expected a finite number");
  return value;
}

function expectPositiveNumber(value: unknown, path: string) {
  const number = expectNumber(value, path);
  if (number <= 0) invalid(path, "expected a number greater than zero");
  return number;
}

function expectBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") invalid(path, "expected a boolean");
  return value;
}

function expectEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    invalid(
      path,
      `expected one of ${allowed.map((item) => `'${item}'`).join(", ")}`,
    );
  }
  return value as Value;
}

function parsePoint(value: unknown, path: string): IndoorPoint {
  const point = expectRecord(value, path);
  expectExactKeys(point, ["x", "y"], path);
  return {
    x: expectNumber(point.x, `${path}.x`),
    y: expectNumber(point.y, `${path}.y`),
  };
}

function parsePolygonPoints(value: unknown, path: string) {
  const points = expectArray(value, path).map((point, index) =>
    parsePoint(point, `${path}[${index}]`),
  );
  if (!isValidIndoorPolygonPoints(points)) {
    invalid(path, "expected a simple polygon with at least three points");
  }
  return points;
}

function parseViewBox(value: unknown): CampusIndoorViewBox {
  const viewBox = expectRecord(value, "viewBox");
  expectExactKeys(viewBox, ["width", "height"], "viewBox");
  return {
    width: expectPositiveNumber(viewBox.width, "viewBox.width"),
    height: expectPositiveNumber(viewBox.height, "viewBox.height"),
  };
}

function parseLevel(
  value: unknown,
  index: number,
  viewBox: CampusIndoorViewBox,
): CampusIndoorLevel {
  const path = `levels[${index}]`;
  const level = expectRecord(value, path);
  expectExactKeys(
    level,
    [
      "id",
      "number",
      "ref",
      "name",
      "elevationMetres",
      "heightMetres",
      "outline",
    ],
    path,
  );
  const outline = parsePolygonPoints(level.outline, `${path}.outline`);
  if (!outline.every((point) => isIndoorPointWithinViewBox(point, viewBox))) {
    invalid(`${path}.outline`, "expected every point to be inside the viewBox");
  }

  return {
    id: expectIdentifier(level.id, `${path}.id`),
    number: expectNumber(level.number, `${path}.number`),
    ref: expectString(level.ref, `${path}.ref`),
    name: expectString(level.name, `${path}.name`),
    elevationMetres: expectNumber(
      level.elevationMetres,
      `${path}.elevationMetres`,
    ),
    heightMetres: expectPositiveNumber(
      level.heightMetres,
      `${path}.heightMetres`,
    ),
    outline,
  };
}

function parseSpaceGeometry(
  value: unknown,
  path: string,
  viewBox: CampusIndoorViewBox,
): IndoorSpaceGeometry {
  const geometry = expectRecord(value, path);
  const type = expectEnum(
    geometry.type,
    ["rectangle", "ellipse", "polygon"] as const,
    `${path}.type`,
  );

  let parsed: IndoorSpaceGeometry;
  if (type === "rectangle") {
    expectExactKeys(
      geometry,
      ["type", "x", "y", "width", "height", "cornerRadius"],
      path,
    );
    const width = expectPositiveNumber(geometry.width, `${path}.width`);
    const height = expectPositiveNumber(geometry.height, `${path}.height`);
    const cornerRadius = expectNumber(
      geometry.cornerRadius,
      `${path}.cornerRadius`,
    );
    if (cornerRadius < 0 || cornerRadius > Math.min(width, height) / 2) {
      invalid(
        `${path}.cornerRadius`,
        "expected a value between zero and half the shortest side",
      );
    }
    parsed = {
      type,
      x: expectNumber(geometry.x, `${path}.x`),
      y: expectNumber(geometry.y, `${path}.y`),
      width,
      height,
      cornerRadius,
    };
  } else if (type === "ellipse") {
    expectExactKeys(geometry, ["type", "cx", "cy", "rx", "ry"], path);
    parsed = {
      type,
      cx: expectNumber(geometry.cx, `${path}.cx`),
      cy: expectNumber(geometry.cy, `${path}.cy`),
      rx: expectPositiveNumber(geometry.rx, `${path}.rx`),
      ry: expectPositiveNumber(geometry.ry, `${path}.ry`),
    };
  } else {
    expectExactKeys(geometry, ["type", "points"], path);
    parsed = {
      type,
      points: parsePolygonPoints(geometry.points, `${path}.points`),
    };
  }

  if (!isIndoorGeometryWithinViewBox(parsed, viewBox)) {
    invalid(path, "expected the complete geometry to be inside the viewBox");
  }
  return parsed;
}

function parseSpace(
  value: unknown,
  index: number,
  viewBox: CampusIndoorViewBox,
): CampusIndoorSpace {
  const path = `spaces[${index}]`;
  const space = expectRecord(value, path);
  expectExactKeys(
    space,
    ["id", "levelId", "kind", "ref", "name", "searchable", "geometry"],
    path,
  );
  return {
    id: expectIdentifier(space.id, `${path}.id`),
    levelId: expectIdentifier(space.levelId, `${path}.levelId`),
    kind: expectEnum(
      space.kind,
      ["room", "corridor", "open-area", "service", "void"] as const,
      `${path}.kind`,
    ),
    ref: expectString(space.ref, `${path}.ref`),
    name: expectString(space.name, `${path}.name`),
    searchable: expectBoolean(space.searchable, `${path}.searchable`),
    geometry: parseSpaceGeometry(space.geometry, `${path}.geometry`, viewBox),
  };
}

function parseWallOpening(
  value: unknown,
  path: string,
  wall: Readonly<{ points: readonly IndoorPoint[]; closed: boolean }>,
): CampusIndoorWallOpening {
  const opening = expectRecord(value, path);
  expectExactKeys(
    opening,
    ["id", "kind", "segmentIndex", "offset", "width", "accessibility"],
    path,
    ["spaceId", "exterior"],
  );

  const segmentIndex = expectNumber(
    opening.segmentIndex,
    `${path}.segmentIndex`,
  );
  const segmentCount = wallSegmentCount(wall);
  if (
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentIndex >= segmentCount
  ) {
    invalid(
      `${path}.segmentIndex`,
      `expected a segment between 0 and ${segmentCount - 1}`,
    );
  }

  const offset = expectNumber(opening.offset, `${path}.offset`);
  if (offset < 0 || offset > 1) {
    invalid(`${path}.offset`, "expected a position between 0 and 1");
  }

  const width = expectNumber(opening.width, `${path}.width`);
  const segmentLength = wallSegmentLength(wall, segmentIndex);
  if (width <= 0 || width > segmentLength) {
    invalid(
      `${path}.width`,
      `expected a width between 0 and the segment length of ${segmentLength}`,
    );
  }

  return {
    id: expectIdentifier(opening.id, `${path}.id`),
    kind: expectEnum(
      opening.kind,
      ["door", "opening"] as const,
      `${path}.kind`,
    ),
    segmentIndex,
    offset,
    width,
    accessibility: parseAccessibility(
      opening.accessibility,
      `${path}.accessibility`,
    ),
    ...(hasOwn(opening, "spaceId")
      ? { spaceId: expectIdentifier(opening.spaceId, `${path}.spaceId`) }
      : {}),
    ...(hasOwn(opening, "exterior")
      ? { exterior: expectBoolean(opening.exterior, `${path}.exterior`) }
      : {}),
  };
}

function parseWall(
  value: unknown,
  index: number,
  viewBox: CampusIndoorViewBox,
): CampusIndoorWall {
  const path = `walls[${index}]`;
  const wall = expectRecord(value, path);
  expectExactKeys(
    wall,
    ["id", "levelId", "kind", "points", "thickness", "closed", "openings"],
    path,
  );

  const points = expectArray(wall.points, `${path}.points`).map(
    (point, pointIndex) => parsePoint(point, `${path}.points[${pointIndex}]`),
  );
  if (points.length < 2) {
    invalid(`${path}.points`, "expected at least two points");
  }
  if (points.length > MAXIMUM_WALL_POINTS) {
    invalid(`${path}.points`, `expected at most ${MAXIMUM_WALL_POINTS} points`);
  }
  points.forEach((point, pointIndex) => {
    if (!isIndoorPointWithinViewBox(point, viewBox)) {
      invalid(
        `${path}.points[${pointIndex}]`,
        "expected a point inside the viewBox",
      );
    }
  });

  const closed = expectBoolean(wall.closed, `${path}.closed`);
  if (closed && points.length < 3) {
    invalid(`${path}.points`, "a closed wall expects at least three points");
  }

  const shape = { points, closed };
  wallSegments(shape).forEach((segment) => {
    const length = Math.hypot(
      segment.end.x - segment.start.x,
      segment.end.y - segment.start.y,
    );
    if (length < MINIMUM_WALL_SEGMENT_LENGTH) {
      invalid(
        `${path}.points[${segment.index}]`,
        `expected consecutive points at least ${MINIMUM_WALL_SEGMENT_LENGTH} units apart`,
      );
    }
  });

  const thickness = expectNumber(wall.thickness, `${path}.thickness`);
  if (
    thickness < MINIMUM_WALL_THICKNESS ||
    thickness > MAXIMUM_WALL_THICKNESS
  ) {
    invalid(
      `${path}.thickness`,
      `expected a thickness between ${MINIMUM_WALL_THICKNESS} and ${MAXIMUM_WALL_THICKNESS}`,
    );
  }

  return {
    id: expectIdentifier(wall.id, `${path}.id`),
    levelId: expectIdentifier(wall.levelId, `${path}.levelId`),
    kind: expectEnum(
      wall.kind,
      ["structural", "partition", "glazing"] as const,
      `${path}.kind`,
    ),
    points,
    thickness,
    closed,
    openings: expectArray(wall.openings, `${path}.openings`).map(
      (opening, openingIndex) =>
        parseWallOpening(opening, `${path}.openings[${openingIndex}]`, shape),
    ),
  };
}

function parseAccessibility(value: unknown, path: string) {
  return expectEnum(
    value,
    ["unknown", "accessible", "inaccessible"] as const,
    path,
  );
}

function parseConnector(
  value: unknown,
  index: number,
  viewBox: CampusIndoorViewBox,
): CampusIndoorConnector {
  const path = `connectors[${index}]`;
  const connector = expectRecord(value, path);
  expectExactKeys(
    connector,
    ["id", "kind", "name", "levelIds", "position", "accessibility"],
    path,
  );
  const levelIds = expectArray(connector.levelIds, `${path}.levelIds`).map(
    (levelId, levelIndex) =>
      expectIdentifier(levelId, `${path}.levelIds[${levelIndex}]`),
  );
  if (levelIds.length === 0) {
    invalid(`${path}.levelIds`, "expected at least one level identifier");
  }
  if (new Set(levelIds).size !== levelIds.length) {
    invalid(`${path}.levelIds`, "expected unique level identifiers");
  }
  const position = parsePoint(connector.position, `${path}.position`);
  if (!isIndoorPointWithinViewBox(position, viewBox)) {
    invalid(`${path}.position`, "expected a point inside the viewBox");
  }

  return {
    id: expectIdentifier(connector.id, `${path}.id`),
    kind: expectEnum(
      connector.kind,
      ["stairs", "lift", "escalator", "ramp"] as const,
      `${path}.kind`,
    ),
    name: expectString(connector.name, `${path}.name`),
    levelIds,
    position,
    accessibility: parseAccessibility(
      connector.accessibility,
      `${path}.accessibility`,
    ),
  };
}

function parseRouteNode(
  value: unknown,
  index: number,
  viewBox: CampusIndoorViewBox,
): CampusIndoorRouteNode {
  const path = `routeNodes[${index}]`;
  const node = expectRecord(value, path);
  expectExactKeys(node, ["id", "levelId", "kind", "position"], path, [
    "connectorId",
    "spaceId",
    "openingId",
    "accessibility",
  ]);
  const kind = expectEnum(
    node.kind,
    ["entrance", "door", "junction", "connector", "space"] as const,
    `${path}.kind`,
  );
  const connectorId = hasOwn(node, "connectorId")
    ? expectIdentifier(node.connectorId, `${path}.connectorId`)
    : undefined;
  const spaceId = hasOwn(node, "spaceId")
    ? expectIdentifier(node.spaceId, `${path}.spaceId`)
    : undefined;
  const openingId = hasOwn(node, "openingId")
    ? expectIdentifier(node.openingId, `${path}.openingId`)
    : undefined;
  const accessibility = hasOwn(node, "accessibility")
    ? parseAccessibility(node.accessibility, `${path}.accessibility`)
    : undefined;
  if (openingId && kind !== "door" && kind !== "entrance") {
    invalid(
      `${path}.openingId`,
      "only valid for a door or entrance route node",
    );
  }
  if (kind === "connector" && !connectorId) {
    invalid(`${path}.connectorId`, "required for a connector route node");
  }
  if (kind !== "connector" && connectorId) {
    invalid(`${path}.connectorId`, "only valid for a connector route node");
  }
  if (kind === "space" && !spaceId) {
    invalid(`${path}.spaceId`, "required for a space route node");
  }
  if (kind !== "space" && kind !== "door" && spaceId) {
    invalid(`${path}.spaceId`, "only valid for a space or door route node");
  }
  if (kind !== "door" && kind !== "entrance" && accessibility) {
    invalid(
      `${path}.accessibility`,
      "only valid for a door or entrance route node",
    );
  }
  const position = parsePoint(node.position, `${path}.position`);
  if (!isIndoorPointWithinViewBox(position, viewBox)) {
    invalid(`${path}.position`, "expected a point inside the viewBox");
  }

  return {
    id: expectIdentifier(node.id, `${path}.id`),
    levelId: expectIdentifier(node.levelId, `${path}.levelId`),
    kind,
    position,
    ...(connectorId ? { connectorId } : {}),
    ...(spaceId ? { spaceId } : {}),
    ...(openingId ? { openingId } : {}),
    ...(accessibility ? { accessibility } : {}),
  };
}

function parseRouteEdge(value: unknown, index: number): CampusIndoorRouteEdge {
  const path = `routeEdges[${index}]`;
  const edge = expectRecord(value, path);
  expectExactKeys(
    edge,
    [
      "id",
      "fromNodeId",
      "toNodeId",
      "kind",
      "bidirectional",
      "distanceMetres",
      "accessibility",
    ],
    path,
  );
  return {
    id: expectIdentifier(edge.id, `${path}.id`),
    fromNodeId: expectIdentifier(edge.fromNodeId, `${path}.fromNodeId`),
    toNodeId: expectIdentifier(edge.toNodeId, `${path}.toNodeId`),
    kind: expectEnum(
      edge.kind,
      ["walking", "stairs", "lift", "escalator", "ramp"] as const,
      `${path}.kind`,
    ),
    bidirectional: expectBoolean(edge.bidirectional, `${path}.bidirectional`),
    distanceMetres: expectPositiveNumber(
      edge.distanceMetres,
      `${path}.distanceMetres`,
    ),
    accessibility: parseAccessibility(
      edge.accessibility,
      `${path}.accessibility`,
    ),
  };
}

function ensureUniqueIds(document: CampusIndoorDocument) {
  const ids = new Set<string>();
  const collections = [
    ["levels", document.levels],
    ["walls", document.walls],
    ["spaces", document.spaces],
    ["connectors", document.connectors],
    ["routeNodes", document.routeNodes],
    ["routeEdges", document.routeEdges],
  ] as const;

  for (const [collectionName, collection] of collections) {
    collection.forEach((item, index) => {
      if (ids.has(item.id)) {
        invalid(
          `${collectionName}[${index}].id`,
          `duplicate identifier '${item.id}'`,
        );
      }
      ids.add(item.id);
    });
  }

  // Openings share the document identifier space because the route graph
  // derives a door node from each one.
  document.walls.forEach((wall, wallIndex) => {
    wall.openings.forEach((opening, openingIndex) => {
      if (ids.has(opening.id)) {
        invalid(
          `walls[${wallIndex}].openings[${openingIndex}].id`,
          `duplicate identifier '${opening.id}'`,
        );
      }
      ids.add(opening.id);
    });
  });
}

function validateReferences(document: CampusIndoorDocument) {
  const levels = new Set(document.levels.map((level) => level.id));
  const spaces = new Map(document.spaces.map((space) => [space.id, space]));
  const connectors = new Map(
    document.connectors.map((connector) => [connector.id, connector]),
  );
  const routeNodes = new Map(
    document.routeNodes.map((node) => [node.id, node]),
  );

  document.spaces.forEach((space, index) => {
    if (!levels.has(space.levelId)) {
      invalid(
        `spaces[${index}].levelId`,
        `unknown level identifier '${space.levelId}'`,
      );
    }
  });

  const openings = new Map<string, CampusIndoorWall>();
  document.walls.forEach((wall, wallIndex) => {
    if (!levels.has(wall.levelId)) {
      invalid(
        `walls[${wallIndex}].levelId`,
        `unknown level identifier '${wall.levelId}'`,
      );
    }
    wall.openings.forEach((opening, openingIndex) => {
      openings.set(opening.id, wall);
      if (!opening.spaceId) return;

      const space = spaces.get(opening.spaceId);
      if (!space) {
        invalid(
          `walls[${wallIndex}].openings[${openingIndex}].spaceId`,
          `unknown space identifier '${opening.spaceId}'`,
        );
      }
      if (space.levelId !== wall.levelId) {
        invalid(
          `walls[${wallIndex}].openings[${openingIndex}].spaceId`,
          `space '${space.id}' is on level '${space.levelId}' but the wall is on '${wall.levelId}'`,
        );
      }
    });
  });

  document.connectors.forEach((connector, connectorIndex) => {
    connector.levelIds.forEach((levelId, levelIndex) => {
      if (!levels.has(levelId)) {
        invalid(
          `connectors[${connectorIndex}].levelIds[${levelIndex}]`,
          `unknown level identifier '${levelId}'`,
        );
      }
    });
  });

  document.routeNodes.forEach((node, index) => {
    if (!levels.has(node.levelId)) {
      invalid(
        `routeNodes[${index}].levelId`,
        `unknown level identifier '${node.levelId}'`,
      );
    }
    if (node.connectorId) {
      const connector = connectors.get(node.connectorId);
      if (!connector) {
        invalid(
          `routeNodes[${index}].connectorId`,
          `unknown connector identifier '${node.connectorId}'`,
        );
      }
      if (!connector.levelIds.includes(node.levelId)) {
        invalid(
          `routeNodes[${index}].levelId`,
          `connector '${connector.id}' does not serve level '${node.levelId}'`,
        );
      }
    }

    if (node.openingId) {
      const wall = openings.get(node.openingId);
      if (!wall) {
        invalid(
          `routeNodes[${index}].openingId`,
          `unknown wall opening identifier '${node.openingId}'`,
        );
      }
      if (wall.levelId !== node.levelId) {
        invalid(
          `routeNodes[${index}].levelId`,
          `wall opening '${node.openingId}' is on level '${wall.levelId}'`,
        );
      }
    }

    if (node.kind === "door" && !node.spaceId) {
      invalid(`routeNodes[${index}].spaceId`, "required for a door route node");
    }
    if (node.spaceId) {
      const space = spaces.get(node.spaceId);
      if (!space) {
        invalid(
          `routeNodes[${index}].spaceId`,
          `unknown space identifier '${node.spaceId}'`,
        );
      }
      if (space.kind !== "room") {
        invalid(
          `routeNodes[${index}].spaceId`,
          `space '${space.id}' is not a room`,
        );
      }
      if (space.levelId !== node.levelId) {
        invalid(
          `routeNodes[${index}].levelId`,
          `space '${space.id}' is on level '${space.levelId}'`,
        );
      }
    }
  });

  document.routeEdges.forEach((edge, index) => {
    const fromNode = routeNodes.get(edge.fromNodeId);
    const toNode = routeNodes.get(edge.toNodeId);
    if (!fromNode) {
      invalid(
        `routeEdges[${index}].fromNodeId`,
        `unknown route node identifier '${edge.fromNodeId}'`,
      );
    }
    if (!toNode) {
      invalid(
        `routeEdges[${index}].toNodeId`,
        `unknown route node identifier '${edge.toNodeId}'`,
      );
    }
    if (fromNode.id === toNode.id) {
      invalid(
        `routeEdges[${index}]`,
        "expected different route nodes at each end",
      );
    }

    if (edge.kind === "walking") {
      if (fromNode.levelId !== toNode.levelId) {
        invalid(
          `routeEdges[${index}].kind`,
          "a walking edge cannot cross levels",
        );
      }
      if (fromNode.kind === "space" || toNode.kind === "space") {
        const spaceNode = fromNode.kind === "space" ? fromNode : toNode;
        const otherNode = fromNode.kind === "space" ? toNode : fromNode;
        if (
          otherNode.kind !== "door" ||
          !spaceNode.spaceId ||
          otherNode.spaceId !== spaceNode.spaceId
        ) {
          invalid(
            `routeEdges[${index}]`,
            "a space route node may only connect to a door for the same room",
          );
        }
      }
      return;
    }

    if (
      fromNode.kind !== "connector" ||
      toNode.kind !== "connector" ||
      !fromNode.connectorId ||
      fromNode.connectorId !== toNode.connectorId
    ) {
      invalid(
        `routeEdges[${index}]`,
        `a '${edge.kind}' edge must join route nodes for the same connector`,
      );
    }
    const connector = connectors.get(fromNode.connectorId);
    if (!connector || connector.kind !== edge.kind) {
      invalid(
        `routeEdges[${index}].kind`,
        `expected the edge kind to match connector '${fromNode.connectorId}'`,
      );
    }
  });
}

export function createEmptyCampusIndoorDocument(
  viewBox: CampusIndoorViewBox = DEFAULT_CAMPUS_INDOOR_VIEW_BOX,
): CampusIndoorDocument {
  if (
    !isFiniteNumber(viewBox.width) ||
    viewBox.width <= 0 ||
    !isFiniteNumber(viewBox.height) ||
    viewBox.height <= 0
  ) {
    throw new TypeError(
      "An empty campus indoor document requires a positive finite viewBox.",
    );
  }

  return {
    version: CAMPUS_INDOOR_DOCUMENT_VERSION,
    viewBox: { width: viewBox.width, height: viewBox.height },
    levels: [],
    walls: [],
    spaces: [],
    connectors: [],
    routeNodes: [],
    routeEdges: [],
  };
}

export function parseCampusIndoorDocument(
  value: unknown,
): CampusIndoorDocument {
  const document = expectRecord(value, "document");
  // Check the version first, so an older document reports the version it is
  // rather than whichever key that version happened not to have.
  if (document.version !== CAMPUS_INDOOR_DOCUMENT_VERSION) {
    invalid("version", `expected version ${CAMPUS_INDOOR_DOCUMENT_VERSION}`);
  }
  expectExactKeys(
    document,
    [
      "version",
      "viewBox",
      "levels",
      "walls",
      "spaces",
      "connectors",
      "routeNodes",
      "routeEdges",
    ],
    "document",
  );

  const viewBox = parseViewBox(document.viewBox);
  const parsed: CampusIndoorDocument = {
    version: CAMPUS_INDOOR_DOCUMENT_VERSION,
    viewBox,
    levels: expectArray(document.levels, "levels").map((level, index) =>
      parseLevel(level, index, viewBox),
    ),
    walls: expectArray(document.walls, "walls").map((wall, index) =>
      parseWall(wall, index, viewBox),
    ),
    spaces: expectArray(document.spaces, "spaces").map((space, index) =>
      parseSpace(space, index, viewBox),
    ),
    connectors: expectArray(document.connectors, "connectors").map(
      (connector, index) => parseConnector(connector, index, viewBox),
    ),
    routeNodes: expectArray(document.routeNodes, "routeNodes").map(
      (node, index) => parseRouteNode(node, index, viewBox),
    ),
    routeEdges: expectArray(document.routeEdges, "routeEdges").map(
      parseRouteEdge,
    ),
  };

  ensureUniqueIds(parsed);
  validateReferences(parsed);
  return parsed;
}

const roomDetailCollator = new Intl.Collator("en-AU", {
  numeric: true,
  sensitivity: "base",
});

export function listIndoorRoomDetails(
  document: CampusIndoorDocument,
): readonly IndoorRoomDetail[] {
  const levels = new Map(document.levels.map((level) => [level.id, level]));

  return document.spaces
    .filter((space) => space.kind === "room" && space.searchable)
    .map((space) => {
      const level = levels.get(space.levelId);
      if (!level) {
        throw new TypeError(
          `Cannot list indoor rooms because space '${space.id}' refers to unknown level '${space.levelId}'.`,
        );
      }
      return {
        id: space.id,
        spaceId: space.id,
        levelId: level.id,
        levelNumber: level.number,
        levelRef: level.ref,
        levelName: level.name,
        ref: space.ref,
        name: space.name,
        label: space.name || space.ref || "Room",
        geometry: space.geometry,
      };
    })
    .sort(
      (left, right) =>
        left.levelNumber - right.levelNumber ||
        roomDetailCollator.compare(left.ref, right.ref) ||
        roomDetailCollator.compare(left.name, right.name) ||
        roomDetailCollator.compare(left.id, right.id),
    );
}

function compareIdentifiers(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareLevels(left: CampusIndoorLevel, right: CampusIndoorLevel) {
  return (
    left.number - right.number ||
    left.elevationMetres - right.elevationMetres ||
    compareIdentifiers(left.id, right.id)
  );
}

function generatedIdentifier(value: string, path: string) {
  if (value.length > MAX_IDENTIFIER_LENGTH || !IDENTIFIER_PATTERN.test(value)) {
    invalid(path, `generated identifier '${value}' is not valid`);
  }
  return value;
}

export function indoorSpaceRouteNodeId(spaceId: string) {
  return generatedIdentifier(`space-${spaceId}`, `spaces['${spaceId}'].id`);
}

export function indoorConnectorRouteNodeId(
  connectorId: string,
  levelId: string,
) {
  return generatedIdentifier(
    `connector-${connectorId}-${levelId}`,
    `connectors['${connectorId}'].levelIds['${levelId}']`,
  );
}

export function indoorDistanceMetres(left: IndoorPoint, right: IndoorPoint) {
  const distance =
    Math.hypot(right.x - left.x, right.y - left.y) *
    INDOOR_METRES_PER_LOCAL_UNIT;
  return Math.max(Number(distance.toFixed(3)), MINIMUM_ROUTE_DISTANCE_METRES);
}

function buildConnectorEdges(
  connector: CampusIndoorConnector,
  connectorIndex: number,
  levelsById: ReadonlyMap<string, CampusIndoorLevel>,
): CampusIndoorRouteEdge[] {
  const levels = connector.levelIds
    .map((levelId) => levelsById.get(levelId)!)
    .sort(compareLevels);

  return levels.slice(0, -1).map((level, levelIndex) => {
    const nextLevel = levels[levelIndex + 1];
    const elevationDistance = Math.abs(
      nextLevel.elevationMetres - level.elevationMetres,
    );
    const fallbackDistance = (level.heightMetres + nextLevel.heightMetres) / 2;
    return {
      id: generatedIdentifier(
        `vertical-${connectorIndex}-${levelIndex}`,
        `connectors[${connectorIndex}].routeEdges[${levelIndex}].id`,
      ),
      fromNodeId: indoorConnectorRouteNodeId(connector.id, level.id),
      toNodeId: indoorConnectorRouteNodeId(connector.id, nextLevel.id),
      kind: connector.kind,
      bidirectional: true,
      distanceMetres: Math.max(
        Number((elevationDistance || fallbackDistance).toFixed(3)),
        MINIMUM_ROUTE_DISTANCE_METRES,
      ),
      accessibility: connector.accessibility,
    };
  });
}

function buildRoomRouteNodes(
  document: CampusIndoorDocument,
  kind: "junction" | "space",
) {
  return document.spaces
    .filter((space) => space.kind === "room" && space.searchable)
    .sort((left, right) => compareIdentifiers(left.id, right.id))
    .map((space): CampusIndoorRouteNode => ({
      id: indoorSpaceRouteNodeId(space.id),
      levelId: space.levelId,
      kind,
      position: indoorGeometryCentre(space.geometry),
      ...(kind === "space" ? { spaceId: space.id } : {}),
    }));
}

function buildConnectorRouteNodes(
  connectors: readonly CampusIndoorConnector[],
  levelsById: ReadonlyMap<string, CampusIndoorLevel>,
) {
  return connectors.flatMap((connector) =>
    connector.levelIds
      .map((levelId) => levelsById.get(levelId)!)
      .sort(compareLevels)
      .map((level): CampusIndoorRouteNode => ({
        id: indoorConnectorRouteNodeId(connector.id, level.id),
        levelId: level.id,
        kind: "connector",
        position: connector.position,
        connectorId: connector.id,
      })),
  );
}

/**
 * Identifier of the route node derived from a wall opening. Doors are not
 * authored loose: each one is a hole an author cut in a wall, so a route can
 * only cross a wall where a gap was actually drawn.
 */
export function indoorOpeningRouteNodeId(openingId: string) {
  return generatedIdentifier(
    `opening-${openingId}`,
    `walls.openings['${openingId}'].id`,
  );
}

/**
 * One route node per wall opening. An opening that leads outside becomes an
 * `entrance`, which is where an outdoor route joins the building; one that
 * serves a room becomes that room's `door`.
 */
function buildOpeningRouteNodes(
  document: CampusIndoorDocument,
  spaces: ReadonlyMap<string, CampusIndoorSpace>,
): CampusIndoorRouteNode[] {
  return document.walls
    .flatMap((wall) =>
      wall.openings.map((opening) => {
        const space = opening.spaceId ? spaces.get(opening.spaceId) : undefined;
        const servesRoom =
          space?.kind === "room" && space.levelId === wall.levelId;
        return {
          id: indoorOpeningRouteNodeId(opening.id),
          levelId: wall.levelId,
          kind: opening.exterior ? ("entrance" as const) : ("door" as const),
          position: openingPoint(wall, opening),
          openingId: opening.id,
          ...(servesRoom && !opening.exterior ? { spaceId: space.id } : {}),
          accessibility: opening.accessibility,
        };
      }),
    )
    .filter((node) => node.kind === "entrance" || node.spaceId !== undefined)
    .sort((left, right) => compareIdentifiers(left.id, right.id));
}

function indoorRoomEntryRouteEdgeId(doorId: string) {
  return generatedIdentifier(
    `room-entry-${doorId}`,
    `routeNodes['${doorId}'].id`,
  );
}

function buildExplicitRouteGraph(
  baseDocument: CampusIndoorDocument,
  sourceNodes: readonly CampusIndoorRouteNode[],
  sourceEdges: readonly CampusIndoorRouteEdge[],
) {
  const levels = [...baseDocument.levels].sort(compareLevels);
  const levelIds = new Set(levels.map((level) => level.id));
  const levelsById = new Map(levels.map((level) => [level.id, level]));
  const spaces = new Map(baseDocument.spaces.map((space) => [space.id, space]));
  const roomNodes = buildRoomRouteNodes(baseDocument, "space");
  const roomNodesBySpaceId = new Map(
    roomNodes.flatMap((node) =>
      node.spaceId ? [[node.spaceId, node] as const] : [],
    ),
  );
  const connectors = [...baseDocument.connectors].sort((left, right) =>
    compareIdentifiers(left.id, right.id),
  );
  const connectorNodes = buildConnectorRouteNodes(connectors, levelsById);
  const openingNodes = buildOpeningRouteNodes(baseDocument, spaces);
  const openingNodeIds = new Set(openingNodes.map((node) => node.id));
  const authoredNodes = sourceNodes
    .filter((node) => node.kind !== "space" && node.kind !== "connector")
    // A node derived from an opening is regenerated, never carried over.
    .filter((node) => !node.openingId && !openingNodeIds.has(node.id))
    .filter((node) => levelIds.has(node.levelId))
    .filter((node) => {
      if (node.kind !== "door") return true;
      if (!node.spaceId) return true;
      const space = spaces.get(node.spaceId);
      return space?.kind === "room" && space.levelId === node.levelId;
    })
    .sort((left, right) => compareIdentifiers(left.id, right.id));
  const routeNodes = [
    ...authoredNodes,
    ...openingNodes,
    ...roomNodes,
    ...connectorNodes,
  ].sort((left, right) => compareIdentifiers(left.id, right.id));
  const routeNodesById = new Map(routeNodes.map((node) => [node.id, node]));
  const sourceEdgesById = new Map(sourceEdges.map((edge) => [edge.id, edge]));

  const roomEntryEdges = [...authoredNodes, ...openingNodes].flatMap((node) => {
    if (node.kind !== "door" || !node.spaceId) return [];
    const roomNode = roomNodesBySpaceId.get(node.spaceId);
    if (!roomNode) return [];
    const id = indoorRoomEntryRouteEdgeId(node.id);
    const existingEdge = sourceEdgesById.get(id);
    return [
      {
        id,
        fromNodeId: roomNode.id,
        toNodeId: node.id,
        kind: "walking" as const,
        bidirectional: true,
        distanceMetres: indoorDistanceMetres(roomNode.position, node.position),
        accessibility:
          node.accessibility ?? existingEdge?.accessibility ?? "unknown",
      },
    ];
  });
  const connectorEdges = connectors.flatMap((connector, connectorIndex) =>
    buildConnectorEdges(connector, connectorIndex, levelsById),
  );
  const generatedEdgeIds = new Set(
    [...roomEntryEdges, ...connectorEdges].map((edge) => edge.id),
  );
  const authoredEdges = sourceEdges
    .filter((edge) => edge.kind === "walking")
    .filter((edge) => !generatedEdgeIds.has(edge.id))
    .filter((edge) => {
      const fromNode = routeNodesById.get(edge.fromNodeId);
      const toNode = routeNodesById.get(edge.toNodeId);
      return (
        fromNode !== undefined &&
        toNode !== undefined &&
        fromNode.kind !== "space" &&
        toNode.kind !== "space"
      );
    });
  const routeEdges = [
    ...authoredEdges,
    ...roomEntryEdges,
    ...connectorEdges,
  ].sort((left, right) => compareIdentifiers(left.id, right.id));

  return parseCampusIndoorDocument({
    ...baseDocument,
    routeNodes,
    routeEdges,
  });
}

export function buildIndoorRouteGraph(
  document: CampusIndoorDocument,
): CampusIndoorDocument {
  const baseDocument = parseCampusIndoorDocument({
    ...document,
    routeNodes: [],
    routeEdges: [],
  });
  const sourceNodes = document.routeNodes.map((node, index) =>
    parseRouteNode(node, index, baseDocument.viewBox),
  );
  const sourceEdges = document.routeEdges.map(parseRouteEdge);
  return buildExplicitRouteGraph(baseDocument, sourceNodes, sourceEdges);
}

/**
 * The route graph also contains generated room-entry and vertical connector
 * links. The editor should draw only the walking paths an author placed.
 */
export function indoorAuthoredRouteEdgeIds(
  document: CampusIndoorDocument,
): ReadonlySet<string> {
  const nodes = new Map(document.routeNodes.map((node) => [node.id, node]));
  return new Set(
    document.routeEdges
      .filter((edge) => {
        if (edge.kind !== "walking") return false;
        const from = nodes.get(edge.fromNodeId);
        const to = nodes.get(edge.toNodeId);
        return Boolean(
          from && to && from.kind !== "space" && to.kind !== "space",
        );
      })
      .map((edge) => edge.id),
  );
}

type RouteTraversal = Readonly<{
  edge: CampusIndoorRouteEdge;
  toNodeId: string;
}>;

export function findIndoorRoute(
  document: CampusIndoorDocument,
  fromSpaceId: string,
  toSpaceId: string,
  options: IndoorRouteOptions = {},
): CampusIndoorRoute | null {
  return findIndoorRouteFromNode(
    document,
    indoorSpaceRouteNodeId(fromSpaceId),
    toSpaceId,
    options,
  );
}

/**
 * Routes from any node to a room. The public journey starts at a building
 * entrance rather than another room, which is what this generalises.
 */
export function findIndoorRouteFromNode(
  document: CampusIndoorDocument,
  fromNodeId: string,
  toSpaceId: string,
  options: IndoorRouteOptions = {},
): CampusIndoorRoute | null {
  // Callers already hold a parsed document; parsing again here made every
  // route lookup re-validate the whole floor plan.
  const routedDocument = document;
  const routableSpaces = new Set(
    routedDocument.spaces
      .filter((space) => space.kind === "room" && space.searchable)
      .map((space) => space.id),
  );
  if (!routableSpaces.has(toSpaceId)) return null;

  const nodes = new Map(
    routedDocument.routeNodes.map((node) => [node.id, node]),
  );
  const sourceNodeId = fromNodeId;
  const targetNodeId = indoorSpaceRouteNodeId(toSpaceId);
  if (!nodes.has(sourceNodeId) || !nodes.has(targetNodeId)) return null;

  const adjacency = new Map<string, RouteTraversal[]>();
  routedDocument.routeNodes.forEach((node) => adjacency.set(node.id, []));
  routedDocument.routeEdges.forEach((edge) => {
    if (options.accessibleOnly && edge.accessibility !== "accessible") return;
    adjacency.get(edge.fromNodeId)!.push({ edge, toNodeId: edge.toNodeId });
    if (edge.bidirectional) {
      adjacency.get(edge.toNodeId)!.push({
        edge,
        toNodeId: edge.fromNodeId,
      });
    }
  });
  adjacency.forEach((traversals) =>
    traversals.sort(
      (left, right) =>
        compareIdentifiers(left.toNodeId, right.toNodeId) ||
        compareIdentifiers(left.edge.id, right.edge.id),
    ),
  );

  const nodeIds = [...nodes.keys()].sort((left, right) =>
    compareIdentifiers(left, right),
  );
  const unsettled = new Set(nodeIds);
  const distances = new Map(nodeIds.map((nodeId) => [nodeId, Infinity]));
  const previous = new Map<
    string,
    Readonly<{ nodeId: string; edgeId: string }>
  >();
  distances.set(sourceNodeId, 0);

  while (unsettled.size > 0) {
    let currentNodeId: string | null = null;
    let currentDistance = Infinity;
    for (const nodeId of nodeIds) {
      if (!unsettled.has(nodeId)) continue;
      const distance = distances.get(nodeId)!;
      if (distance < currentDistance) {
        currentNodeId = nodeId;
        currentDistance = distance;
      }
    }
    if (!currentNodeId || !Number.isFinite(currentDistance)) break;
    unsettled.delete(currentNodeId);
    if (currentNodeId === targetNodeId) break;

    for (const traversal of adjacency.get(currentNodeId) ?? []) {
      if (!unsettled.has(traversal.toNodeId)) continue;
      const candidateDistance = currentDistance + traversal.edge.distanceMetres;
      if (candidateDistance < distances.get(traversal.toNodeId)!) {
        distances.set(traversal.toNodeId, candidateDistance);
        previous.set(traversal.toNodeId, {
          nodeId: currentNodeId,
          edgeId: traversal.edge.id,
        });
      }
    }
  }

  const distanceMetres = distances.get(targetNodeId)!;
  if (!Number.isFinite(distanceMetres)) return null;

  const routeNodeIds = [targetNodeId];
  const routeEdgeIds: string[] = [];
  let currentNodeId = targetNodeId;
  while (currentNodeId !== sourceNodeId) {
    const preceding = previous.get(currentNodeId);
    if (!preceding) return null;
    routeEdgeIds.unshift(preceding.edgeId);
    routeNodeIds.unshift(preceding.nodeId);
    currentNodeId = preceding.nodeId;
  }

  const levelIds: string[] = [];
  const seenLevelIds = new Set<string>();
  routeNodeIds.forEach((nodeId) => {
    const levelId = nodes.get(nodeId)!.levelId;
    if (!seenLevelIds.has(levelId)) {
      seenLevelIds.add(levelId);
      levelIds.push(levelId);
    }
  });

  return {
    nodeIds: routeNodeIds,
    edgeIds: routeEdgeIds,
    levelIds,
    distanceMetres: Number(distanceMetres.toFixed(3)),
  };
}
