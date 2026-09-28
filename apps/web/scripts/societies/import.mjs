import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createLocalDatabaseClient,
  assertVerifiedLocalDatabaseClient,
} from "../catalogue/lib/local-database.mjs";

/** Import a reviewed snapshot atomically; missing listings never delete data. */
export async function importSocieties(sql, snapshot) {
  assertVerifiedLocalDatabaseClient(sql);
  if (
    snapshot.source !== "rubric" ||
    !Number.isFinite(Date.parse(snapshot.retrievedAt))
  ) {
    throw new Error("The society snapshot has invalid provenance.");
  }
  const clubs = new Map(snapshot.societies.map((club) => [club.slug, club]));
  if (clubs.size !== snapshot.societies.length)
    throw new Error("The society snapshot contains duplicate clubs.");
  for (const event of snapshot.events) {
    if (
      !clubs.has(event.societySlug) ||
      !(Date.parse(event.endsAt) > Date.parse(event.startsAt))
    ) {
      throw new Error(
        "Every society event needs an organiser and a valid date range.",
      );
    }
  }
  return sql.begin(async (transaction) => {
    const ids = new Map();
    let societiesChanged = 0;
    let eventsChanged = 0;
    for (const club of snapshot.societies) {
      const social = (label) =>
        club.links?.find((link) => link.label === label)?.url ?? null;
      const row = {
        id: club.id,
        slug: club.slug,
        source: snapshot.source,
        source_id: club.sourceId,
        name: club.name,
        short_name: club.shortName,
        category: club.category,
        summary: club.summary,
        overview: club.overview,
        interests: club.interests,
        website_url: club.website ?? null,
        logo_url: club.logoUrl ?? null,
        instagram_url: social("Instagram"),
        facebook_url: social("Facebook"),
        discord_url: social("Discord"),
        source_url: club.directoryUrl,
        fetched_at: snapshot.retrievedAt,
        source_hash: club.sourceHash,
      };
      const columns = Object.keys(row).filter((key) => key !== "id");
      const changed = await transaction`
        insert into public.societies ${transaction(row)}
        on conflict (source, source_id) do update set ${transaction(row, columns)}
        where societies.source_hash is distinct from excluded.source_hash
        returning id`;
      societiesChanged += changed.length;
      const [stored] = changed.length
        ? changed
        : await transaction`select id from public.societies where source = ${snapshot.source} and source_id = ${club.sourceId}`;
      ids.set(club.slug, stored.id);
    }
    for (const event of snapshot.events) {
      const row = {
        id: event.id,
        society_id: ids.get(event.societySlug),
        source: snapshot.source,
        source_id: event.sourceId,
        title: event.title,
        category: event.category,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        location: event.location,
        description: event.description,
        artwork_url: event.artworkUrl ?? null,
        tickets_url: event.ticketsUrl ?? null,
        source_url: event.sourceUrl,
        fetched_at: snapshot.retrievedAt,
        source_hash: event.sourceHash,
      };
      const changed = await transaction`
        insert into public.society_events ${transaction(row)}
        on conflict (source, source_id) do update set ${transaction(
          row,
          Object.keys(row).filter((key) => key !== "id"),
        )}
        where society_events.source_hash is distinct from excluded.source_hash
        returning id`;
      eventsChanged += changed.length;
    }
    return { societiesChanged, eventsChanged };
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const snapshotPath =
    process.argv[2] ?? new URL("./data/anu-2026-09-28.json", import.meta.url);
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const sql = await createLocalDatabaseClient();
  try {
    console.log(await importSocieties(sql, snapshot));
  } finally {
    await sql.end();
  }
}
