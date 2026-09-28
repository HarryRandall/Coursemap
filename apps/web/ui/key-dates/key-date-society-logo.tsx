import { UsersRound } from "lucide-react";
import type { Society } from "@/lib/societies";
import { SocietyEmblem } from "@/ui/societies/society-emblem";

export function KeyDateSocietyLogo({
  society,
}: {
  society?: Pick<Society, "slug" | "logoUrl">;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center"
    >
      {society ? (
        <SocietyEmblem society={society} small />
      ) : (
        <UsersRound className="size-5 text-muted-foreground" />
      )}
    </span>
  );
}
