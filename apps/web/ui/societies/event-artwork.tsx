"use client";

import Image from "next/image";
import { useState } from "react";
import { CalendarDays, Gamepad2, GraduationCap } from "lucide-react";
import type { SocietyEvent } from "@/lib/society-events";
import { SocietyEmblem } from "@/ui/societies/society-emblem";

export function EventArtwork({ event }: { event: SocietyEvent }) {
  const [failedArtwork, setFailedArtwork] = useState<string>();
  const artworkUrl =
    failedArtwork === event.artworkUrl ? undefined : event.artworkUrl;
  const society = event.society;
  const Icon =
    event.category === "workshop"
      ? GraduationCap
      : event.category === "gaming"
        ? Gamepad2
        : CalendarDays;
  return (
    <div
      className={`flex aspect-video items-center justify-center overflow-hidden rounded-lg ${artworkUrl ? "" : "bg-muted"}`}
    >
      {artworkUrl ? (
        <Image
          src={artworkUrl}
          alt=""
          width={800}
          height={450}
          unoptimized
          referrerPolicy="no-referrer"
          className="size-full object-contain"
          onError={() => setFailedArtwork(event.artworkUrl)}
        />
      ) : society ? (
        <SocietyEmblem society={society} large />
      ) : (
        <Icon aria-hidden="true" className="size-12 text-muted-foreground" />
      )}
    </div>
  );
}
