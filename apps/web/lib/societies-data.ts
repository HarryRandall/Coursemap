import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public-server";
import { SOCIETY_CATEGORIES, type Society } from "@/lib/societies";
import type { Database } from "@/types/database";
import type { SocietyEvent } from "@/lib/society-events";

async function loadPublishedRows<Row>(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: unknown;
  }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await readPage(from, from + pageSize - 1);
    if (page.error)
      throw new Error(
        "The society directory could not be loaded. Please try again shortly.",
      );
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) return rows;
  }
}

type SocietyRow = Database["public"]["Tables"]["societies"]["Row"];
type EventRow = Database["public"]["Tables"]["society_events"]["Row"];

type SocietyReadOptions = {
  slug?: string;
  eventId?: string;
  eventSourceId?: string;
  startsFrom?: string;
  startsBefore?: string;
  endsAfter?: string;
};

async function readSocieties(options: SocietyReadOptions = {}) {
  const client = createPublicClient();
  const readClubs = (ids?: string[]) =>
    loadPublishedRows((from, to) => {
      let query = client
        .from("societies")
        .select("*")
        .eq("status", "published");
      if (options.slug) query = query.eq("slug", options.slug);
      if (ids) query = query.in("id", ids);
      return query.order("name").order("id").range(from, to);
    });
  const readEvents = (societyIds?: string[]) =>
    loadPublishedRows((from, to) => {
      let query = client
        .from("society_events")
        .select("*")
        .eq("status", "published");
      if (societyIds) query = query.in("society_id", societyIds);
      if (options.eventId) query = query.eq("id", options.eventId);
      if (options.eventSourceId)
        query = query.eq("source_id", options.eventSourceId);
      if (options.startsFrom)
        query = query.gte("starts_at", options.startsFrom);
      if (options.startsBefore)
        query = query.lt("starts_at", options.startsBefore);
      if (options.endsAfter) query = query.gt("ends_at", options.endsAfter);
      return query.order("starts_at").order("id").range(from, to);
    });
  let clubs: SocietyRow[];
  let listings: EventRow[];
  if (options.eventId || options.eventSourceId) {
    listings = await readEvents();
    clubs = listings.length
      ? await readClubs([...new Set(listings.map((row) => row.society_id))])
      : [];
  } else if (options.slug) {
    clubs = await readClubs();
    listings = clubs.length ? await readEvents(clubs.map((row) => row.id)) : [];
  } else {
    [clubs, listings] = await Promise.all([readClubs(), readEvents()]);
  }
  const byId = new Map<string, Society>();
  for (const row of clubs) {
    const category = SOCIETY_CATEGORIES.find((value) => value === row.category);
    if (!category) throw new Error("The society category is not recognised.");
    const links = [
      { label: "Instagram", url: row.instagram_url },
      { label: "Facebook", url: row.facebook_url },
      { label: "Discord", url: row.discord_url },
    ].filter((link): link is { label: string; url: string } =>
      Boolean(link.url),
    );
    byId.set(row.id, {
      slug: row.slug,
      name: row.name,
      shortName: row.short_name,
      category,
      summary: row.summary,
      overview: row.overview,
      interests: row.interests,
      website: row.website_url ?? undefined,
      logoUrl: row.logo_url ?? undefined,
      directoryUrl: row.source_url,
      links,
    });
  }
  const events: SocietyEvent[] = [];
  for (const row of listings) {
    const society = byId.get(row.society_id);
    if (!society) continue;
    const category = row.category;
    if (
      category !== "social" &&
      category !== "workshop" &&
      category !== "gaming"
    )
      throw new Error("The society event category is not recognised.");
    events.push({
      id: row.id,
      sourceId: row.source_id,
      category,
      title: row.title,
      host: society.name,
      hostProfileUrl: society.directoryUrl!,
      societySlug: society.slug,
      society,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location,
      sourceUrl: row.source_url,
      description: row.description.trim() || society.summary,
      artworkUrl: row.artwork_url ?? undefined,
      ticketsUrl: row.tickets_url ?? undefined,
    });
  }
  return { societies: [...byId.values()], events };
}

/** Public snapshots are read from the database, never the import fixtures. */
export const loadSocieties = cache(() => readSocieties());

export const loadSocietyProfile = cache((slug: string) =>
  readSocieties({ slug }),
);

/** Legacy source IDs still resolve to their canonical event URL. */
export const loadSocietyEvent = cache(async (id: string) => {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  let result = isUuid ? await readSocieties({ eventId: id }) : undefined;
  if (!result?.events.length)
    result = await readSocieties({ eventSourceId: id });
  return result.events[0] ?? null;
});

export const loadSocietiesForYear = cache((year: number) =>
  readSocieties({
    // Both boundaries are midnight in Canberra, where January uses UTC+11.
    startsFrom: `${year - 1}-12-31T13:00:00Z`,
    startsBefore: `${year}-12-31T13:00:00Z`,
  }),
);

export const loadUpcomingSocieties = cache((now: string) =>
  readSocieties({ endsAfter: now }),
);
