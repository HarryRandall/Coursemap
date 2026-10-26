import { NextResponse } from "next/server";
import { loadCampusMapData } from "@/lib/rooms/campus-map-data";

/**
 * The published outdoor campus map for small embedded previews, such as a
 * Compass place card. Indoor plans and the room index stay with the Room
 * finder page.
 */
export async function GET() {
  const { data, error } = await loadCampusMapData();
  if (error) return NextResponse.json({ error }, { status: 503 });
  return NextResponse.json(
    {
      campus: data.campus,
      layers: data.layers,
      places: data.places,
      features: data.features,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
