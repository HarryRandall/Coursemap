"use client";

import Image from "next/image";
import { useState } from "react";
import {
  CodeXml,
  Gamepad2,
  Globe2,
  Megaphone,
  Music2,
  Sprout,
  Utensils,
  UsersRound,
  ChartNoAxesCombined,
  ChessKnight,
  type LucideIcon,
} from "lucide-react";
import type { Society } from "@/lib/societies";
import { cn } from "@/lib/cn";

const emblems: Record<string, { Icon: LucideIcon; colour: string }> = {
  "amnesty-school-group": {
    Icon: Megaphone,
    colour: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  "actuarial-society": {
    Icon: ChartNoAxesCombined,
    colour: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  "afec-students-society": {
    Icon: ChartNoAxesCombined,
    colour: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  "african-cultural-society": {
    Icon: Globe2,
    colour: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  "agricultural-society": {
    Icon: Sprout,
    colour: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  "anime-and-gaming-society": {
    Icon: Gamepad2,
    colour: "bg-primary/10 text-primary",
  },
  "chess-society": {
    Icon: ChessKnight,
    colour: "bg-foreground/8 text-foreground",
  },
  "computer-science-students-association": {
    Icon: CodeXml,
    colour: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  "dining-society": {
    Icon: Utensils,
    colour: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  "music-society": {
    Icon: Music2,
    colour: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
};

export function SocietyEmblem({
  society,
  large = false,
  small = false,
}: {
  society: Pick<Society, "slug" | "logoUrl">;
  large?: boolean;
  small?: boolean;
}) {
  const [failedLogo, setFailedLogo] = useState<string>();
  const { Icon, colour } = emblems[society.slug] ?? {
    Icon: UsersRound,
    colour: "bg-primary/10 text-primary",
  };
  if (society.logoUrl && failedLogo !== society.logoUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white",
          large ? "size-16" : small ? "size-7 rounded-md" : "size-12",
        )}
      >
        <Image
          src={society.logoUrl}
          alt=""
          width={large ? 64 : small ? 28 : 48}
          height={large ? 64 : small ? 28 : 48}
          unoptimized
          referrerPolicy="no-referrer"
          className="size-full object-contain"
          onError={() => setFailedLogo(society.logoUrl)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        colour,
        large ? "size-16" : small ? "size-7 rounded-md" : "size-12",
      )}
    >
      <Icon className={large ? "size-8" : small ? "size-4" : "size-6"} />
    </span>
  );
}
