import type { CampusMapPlace, CampusWalkingRoute } from "./campus-map";

const DEFAULT_ROUTING_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => Number.isFinite(coordinate))
  );
}

export function buildWalkingRouteUrl(
  from: Pick<CampusMapPlace, "coordinates">,
  to: Pick<CampusMapPlace, "coordinates">,
  routingUrl = process.env.ROOM_MAP_ROUTING_URL ?? DEFAULT_ROUTING_URL,
) {
  const baseUrl = new URL(routingUrl);
  const localHttp =
    baseUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !localHttp) {
    throw new Error("The Room Finder routing URL must use HTTPS.");
  }

  const coordinates = `${from.coordinates.join(",")};${to.coordinates.join(",")}`;
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/${coordinates}`;
  baseUrl.searchParams.set("overview", "full");
  baseUrl.searchParams.set("geometries", "geojson");
  baseUrl.searchParams.set("steps", "false");
  return baseUrl;
}

export function parseWalkingRouteResponse(
  value: unknown,
): CampusWalkingRoute | null {
  if (!value || typeof value !== "object") return null;
  const routes = Reflect.get(value, "routes");
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const route = routes[0];
  if (!route || typeof route !== "object") return null;
  const geometry = Reflect.get(route, "geometry");
  if (!geometry || typeof geometry !== "object") return null;

  const coordinates = Reflect.get(geometry, "coordinates");
  const distance = Reflect.get(route, "distance");
  const duration = Reflect.get(route, "duration");
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.every(isCoordinate) ||
    !Number.isFinite(distance) ||
    !Number.isFinite(duration)
  ) {
    return null;
  }

  return {
    coordinates,
    distanceMetres: distance as number,
    durationSeconds: duration as number,
  };
}
