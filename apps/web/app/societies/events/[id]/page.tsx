import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarDays, MapPin, ExternalLink } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { formatEventDate } from "@/lib/society-events";
import { loadSocieties } from "@/lib/societies-data";
import { AppShell } from "@/ui/shell/app-shell";
import { EventArtwork } from "@/ui/societies/event-artwork";
import { SocietyEmblem } from "@/ui/societies/society-emblem";

export const dynamic = "force-dynamic";

export default async function SocietyEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { societies, events } = await loadSocieties();
  const event = events.find((item) => item.id === id);
  if (!event) {
    const previousEvent = events.find((item) => item.sourceId === id);
    if (previousEvent)
      permanentRedirect(`/societies/events/${previousEvent.id}`);
    notFound();
  }
  const society = societies.find((item) => item.slug === event.societySlug);
  return (
    <AppShell currentBreadcrumbLabel={event.title}>
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <div className="space-y-7 lg:col-span-2">
          <EventArtwork event={event} />
          <h1 className="text-xl leading-snug font-semibold sm:text-2xl">
            {event.title}
          </h1>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">About the event</h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          </section>
        </div>
        <aside className="space-y-6 rounded-xl bg-card p-6 ring-1 ring-border lg:sticky lg:top-6 dark:ring-0">
          <dl className="space-y-5 text-sm">
            <div className="space-y-2">
              <dt className="flex items-center gap-2 font-medium">
                <CalendarDays
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                When
              </dt>
              <dd className="space-y-1 text-muted-foreground">
                <p>
                  <time dateTime={event.startsAt}>
                    {formatEventDate(event.startsAt)}
                  </time>
                </p>
                <p>
                  Until{" "}
                  <time dateTime={event.endsAt}>
                    {formatEventDate(event.endsAt)}
                  </time>
                </p>
                <p className="text-xs">Canberra time</p>
              </dd>
            </div>
            <div className="space-y-2">
              <dt className="flex items-center gap-2 font-medium">
                <MapPin
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                Where
              </dt>
              <dd className="text-muted-foreground">{event.location}</dd>
            </div>
          </dl>
          <Button asChild className="w-full">
            <a
              href={event.ticketsUrl ?? event.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View tickets
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Organised by</h2>
            {society ? (
              <Link
                href={`/societies/${society.slug}?tab=events`}
                className="flex items-center gap-3 rounded-lg hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <SocietyEmblem society={society} />
                <span className="text-sm font-medium">{event.host}</span>
              </Link>
            ) : (
              <a
                href={event.hostProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm hover:text-primary"
              >
                {event.host}
                <ExternalLink
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
              </a>
            )}
          </section>
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
          >
            View original listing
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </aside>
      </div>
    </AppShell>
  );
}
