import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public-server";
import { SOCIETY_CATEGORIES, type Society } from "@/lib/societies";
import type { SocietyEvent } from "@/lib/society-events";

/** Public snapshots are read from the database, never the import fixtures. */
export const loadSocieties = cache(
  async (): Promise<{ societies: Society[]; events: SocietyEvent[] }> => {
    const client = createPublicClient();
    const [clubs, listings] = await Promise.all([
      client
        .from("societies")
        .select("*")
        .eq("status", "published")
        .order("name"),
      client
        .from("society_events")
        .select("*")
        .eq("status", "published")
        .order("starts_at"),
    ]);
    if (clubs.error || listings.error)
      throw new Error(
        "The society directory could not be loaded. Please try again shortly.",
      );
    const byId = new Map<string, Society>();
    for (const row of clubs.data ?? []) {
      const category = SOCIETY_CATEGORIES.find(
        (value) => value === row.category,
      );
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
    for (const row of listings.data ?? []) {
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
        description: row.description,
        artworkUrl: row.artwork_url ?? undefined,
        ticketsUrl: row.tickets_url ?? undefined,
      });
    }
    return { societies: [...byId.values()], events };
  },
);
