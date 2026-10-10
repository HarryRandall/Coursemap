import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "@/lib/supabase/config";
import { parseWalkingRouteResponse } from "@/lib/rooms/routing";
import type { CampusWalkingRoute } from "@/lib/rooms/campus-map";
import type { Database } from "@/types/database";

const ROUTE_CACHE_LIFETIME_MS = 3_600_000;

/** The browser cannot read or write the cache or claim the shared provider slot. */
export function createRoomRouteCache() {
  const { url } = requireSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Room Finder routing is not configured.");
  const client = createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return {
    async read(routeKey: string) {
      const { data, error } = await client
        .from("room_route_cache")
        .select("coordinates,distance_metres,duration_seconds")
        .eq("route_key", routeKey)
        .gt(
          "cached_at",
          new Date(Date.now() - ROUTE_CACHE_LIFETIME_MS).toISOString(),
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return parseWalkingRouteResponse({
        routes: [
          {
            geometry: { coordinates: data.coordinates },
            distance: data.distance_metres,
            duration: data.duration_seconds,
          },
        ],
      });
    },
    async claim() {
      const { data, error } = await client.rpc("claim_room_route_request");
      if (error) throw error;
      return data === true;
    },
    async write(routeKey: string, route: CampusWalkingRoute) {
      const { error } = await client.from("room_route_cache").upsert({
        route_key: routeKey,
        coordinates: route.coordinates.map((coordinate) => [...coordinate]),
        distance_metres: route.distanceMetres,
        duration_seconds: route.durationSeconds,
        cached_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
  };
}
