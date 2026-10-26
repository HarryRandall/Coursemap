import Link from "next/link";
import { MapPin, Navigation } from "lucide-react";
import type { AssistantPlace } from "@/lib/assistant/attachments";

/**
 * A campus place Compass found. Both actions open the 3D Room finder, which
 * draws the building and the walking route; Compass never writes the route
 * out as steps.
 */
export function AssistantPlaceCard({ place }: { place: AssistantPlace }) {
  const directions = place.from
    ? `/rooms?from=${encodeURIComponent(place.from.slug)}&to=${encodeURIComponent(place.slug)}`
    : null;
  return (
    <div className="flex h-36 flex-col overflow-hidden rounded-xl border border-border text-xs">
      <div className="flex min-h-0 flex-1 items-start gap-2.5 p-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MapPin aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {place.name}
          </span>
          <span className="line-clamp-2 text-muted-foreground">
            {place.from ? `From ${place.from.name}` : place.address}
          </span>
        </span>
      </div>
      <div className="grid shrink-0 grid-cols-2 border-t border-border">
        <Link
          href={`/rooms?place=${encodeURIComponent(place.slug)}`}
          className={
            directions
              ? "flex items-center justify-center gap-1.5 py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              : "col-span-2 flex items-center justify-center gap-1.5 py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          }
        >
          <MapPin aria-hidden="true" className="size-3.5" />
          Show on map
        </Link>
        {directions ? (
          <Link
            href={directions}
            className="flex items-center justify-center gap-1.5 border-l border-border py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <Navigation aria-hidden="true" className="size-3.5" />
            Directions
          </Link>
        ) : null}
      </div>
    </div>
  );
}
