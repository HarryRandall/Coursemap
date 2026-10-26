import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import type { AssistantSociety } from "@/lib/assistant/attachments";

/** A society Compass found, linking to its Coursemap profile. */
export function AssistantSocietyCard({
  society,
}: {
  society: AssistantSociety;
}) {
  return (
    <Link
      href={`/societies/${society.slug}`}
      className="group/card flex h-36 flex-col gap-2 overflow-hidden rounded-xl border border-border p-3.5 text-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <span className="flex items-center gap-2.5">
        {society.logoUrl ? (
          // Society logos come from many hosts, so they skip image optimisation.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={society.logoUrl}
            alt=""
            className="size-8 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users aria-hidden="true" className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {society.name}
          </span>
          <span className="block truncate text-muted-foreground">
            {society.category}
          </span>
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5 motion-reduce:transform-none"
        />
      </span>
      <span className="line-clamp-3 leading-relaxed text-muted-foreground">
        {society.summary}
      </span>
    </Link>
  );
}
