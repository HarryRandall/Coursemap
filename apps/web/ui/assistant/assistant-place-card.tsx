"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, Navigation } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import type { AssistantPlace } from "@/lib/assistant/attachments";
import { cn } from "@/lib/cn";

// MapLibre is large, so it loads only when a map preview reaches the screen.
const AssistantPlaceMap = dynamic(
  () =>
    import("./assistant-place-map").then((module) => module.AssistantPlaceMap),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-muted" />,
  },
);

const ACTION =
  "flex items-center justify-center gap-1.5 py-2.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/**
 * A campus place Compass found. The first place in a reply shows the 3D map
 * framed on the building, with the walking route when the student gave a
 * start point. Both actions open the Room finder; Compass never writes the
 * route out as steps.
 */
export function AssistantPlaceCard({
  place,
  showMap,
}: {
  place: AssistantPlace;
  showMap: boolean;
}) {
  const [ref, inView] = useInView<HTMLDivElement>("200px 0px");
  const mapHref = `/rooms?place=${encodeURIComponent(place.slug)}`;
  const directions = place.from
    ? `/rooms?from=${encodeURIComponent(place.from.slug)}&to=${encodeURIComponent(place.slug)}`
    : null;
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border text-xs",
        showMap ? "sm:col-span-2" : "h-36",
      )}
    >
      {showMap ? (
        <Link
          href={directions ?? mapHref}
          aria-label={
            directions
              ? `Open directions to ${place.name} in the Room finder`
              : `Open ${place.name} in the Room finder`
          }
          // The Room finder's map keeps a tall minimum height and its own
          // controls; the preview sets the size and keeps only attribution.
          className="relative block h-52 overflow-hidden border-b border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none focus-visible:ring-inset [&_.maplibregl-ctrl-attrib]:text-[9px] [&_.maplibregl-ctrl-group]:hidden [&_.room-map]:min-h-0 [&_button]:hidden"
        >
          {inView ? <AssistantPlaceMap place={place} /> : null}
        </Link>
      ) : null}
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
          href={mapHref}
          className={cn(ACTION, !directions && "col-span-2")}
        >
          <MapPin aria-hidden="true" className="size-3.5" />
          Show on map
        </Link>
        {directions ? (
          <Link
            href={directions}
            className={cn(ACTION, "border-l border-border")}
          >
            <Navigation aria-hidden="true" className="size-3.5" />
            Directions
          </Link>
        ) : null}
      </div>
    </div>
  );
}
