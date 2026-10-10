import { NextResponse } from "next/server";
import type { CampusWalkingRoute } from "@/lib/rooms/campus-map";
import { createRoomRouteCache } from "@/lib/rooms/route-cache";
import { loadCampusRoutePlaces } from "@/lib/rooms/campus-map-data";
import {
  buildWalkingRouteUrl,
  parseWalkingRouteResponse,
} from "@/lib/rooms/routing";
import { getCanonicalSiteOrigin } from "@/lib/supabase/config";

const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const fromSlug = requestUrl.searchParams.get("from") ?? "";
  const toSlug = requestUrl.searchParams.get("to") ?? "";

  if (
    !SLUG_PATTERN.test(fromSlug) ||
    !SLUG_PATTERN.test(toSlug) ||
    fromSlug === toSlug
  ) {
    return NextResponse.json(
      { error: "Choose two different campus places." },
      { status: 400 },
    );
  }

  const { places, error } = await loadCampusRoutePlaces([fromSlug, toSlug]);
  if (error) {
    return NextResponse.json({ error }, { status: 503 });
  }

  const from = places.find((place) => place.slug === fromSlug);
  const to = places.find((place) => place.slug === toSlug);
  if (!from?.isRoutable || !to?.isRoutable) {
    return NextResponse.json(
      { error: "Walking directions are not available for those places." },
      { status: 404 },
    );
  }

  let cache: ReturnType<typeof createRoomRouteCache>;
  let routeUrl: URL;
  let routeKey: string;
  let cachedRoute: CampusWalkingRoute | null;
  try {
    routeUrl = buildWalkingRouteUrl(from, to);
    // Include the provider and coordinates so moved places cannot reuse an old route.
    routeKey = JSON.stringify([from.id, to.id, routeUrl.href]);
    cache = createRoomRouteCache();
    cachedRoute = await cache.read(routeKey);
    if (!cachedRoute && !(await cache.claim())) {
      return NextResponse.json(
        { error: "Walking directions are busy. Try again in a moment." },
        { status: 429, headers: { "Retry-After": "1" } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Walking directions are temporarily unavailable." },
      { status: 503 },
    );
  }

  if (cachedRoute) return routeResponse(cachedRoute);

  try {
    const siteOrigin = getCanonicalSiteOrigin() ?? "https://coursemap.app";
    const response = await fetch(routeUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": `Coursemap/0.1 (+${siteOrigin})`,
      },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    });

    if (!response.ok) throw new Error("Routing provider request failed.");
    const route = parseWalkingRouteResponse(await response.json());
    if (!route) throw new Error("Routing provider returned no usable route.");

    await cache.write(routeKey, route);
    return routeResponse(route);
  } catch (error) {
    return NextResponse.json(
      { error: "Walking directions are temporarily unavailable." },
      {
        status:
          error instanceof Error && error.name === "TimeoutError" ? 504 : 502,
      },
    );
  }
}

function routeResponse(route: CampusWalkingRoute) {
  return NextResponse.json(route, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
