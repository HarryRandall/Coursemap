import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { importSocieties } from "../scripts/societies/import.mjs";
import { renderSocietiesSql } from "../scripts/societies/export-sql.mjs";

const original = JSON.parse(
  await readFile(
    new URL("../scripts/societies/data/anu-2026-09-28.json", import.meta.url),
    "utf8",
  ),
);

test("portable SQL previews, replays, preserves archives and rolls back conflicts", async () => {
  const sql = await createLocalDatabaseClient();
  const prefix = `sql-test-${randomUUID()}`;
  const snapshot = structuredClone(original);
  for (const club of snapshot.societies) {
    const slug = club.slug;
    club.id = randomUUID();
    club.slug = `${prefix}-${slug}`;
    club.sourceId = `${prefix}-${club.sourceId}`;
    for (const event of snapshot.events.filter(
      (item) => item.societySlug === slug,
    ))
      event.societySlug = club.slug;
  }
  for (const event of snapshot.events) {
    event.id = randomUUID();
    event.sourceId = `${prefix}-${event.sourceId}`;
  }
  const clubKeys = snapshot.societies.map((club) => club.sourceId);
  const eventKeys = snapshot.events.map((event) => event.sourceId);
  const extraClub = {
    ...snapshot.societies[0],
    id: randomUUID(),
    slug: `${prefix}-blocked`,
    sourceId: `${prefix}-blocked`,
  };
  clubKeys.push(extraClub.sourceId);
  try {
    await sql.unsafe(renderSocietiesSql(snapshot));
    const [preview] =
      await sql`select count(*)::int as count from public.societies where source_id in ${sql(clubKeys)}`;
    expect(preview.count).toBe(0);
    await sql.unsafe(renderSocietiesSql(snapshot, { apply: true }));
    const before =
      await sql`select id, xmin::text as revision from public.societies where source_id in ${sql(clubKeys)} order by id`;
    expect(before).toHaveLength(23);
    const [events] =
      await sql`select count(*)::int as count from public.society_events where source_id in ${sql(eventKeys)}`;
    expect(events.count).toBe(20);
    await sql.unsafe(renderSocietiesSql(snapshot, { apply: true }));
    expect(
      await sql`select id, xmin::text as revision from public.societies where source_id in ${sql(clubKeys)} order by id`,
    ).toEqual(before);

    await sql`update public.societies set status = 'archived' where source_id = ${snapshot.societies[0].sourceId}`;
    const revised = structuredClone(snapshot);
    revised.societies[0].id = randomUUID();
    revised.societies[0].summary =
      "Harry's club \\ trail '); drop table public.societies; --";
    revised.societies[0].sourceHash = "e".repeat(64);
    revised.events[0].id = randomUUID();
    revised.events[0].title = "Revised event";
    revised.events[0].sourceHash = "f".repeat(64);
    await sql.unsafe(renderSocietiesSql(revised, { apply: true }));
    const [club] =
      await sql`select id, summary, status from public.societies where source_id = ${snapshot.societies[0].sourceId}`;
    expect(club).toEqual({
      id: snapshot.societies[0].id,
      summary: revised.societies[0].summary,
      status: "archived",
    });
    const [event] =
      await sql`select id, title, society_id from public.society_events where source_id = ${snapshot.events[0].sourceId}`;
    const organiser = snapshot.societies.find(
      (item) => item.slug === snapshot.events[0].societySlug,
    );
    expect(event).toEqual({
      id: snapshot.events[0].id,
      title: "Revised event",
      society_id: organiser.id,
    });

    await importSocieties(sql, {
      ...snapshot,
      societies: [extraClub],
      events: [],
    });
    const invalid = structuredClone(revised);
    invalid.societies[0].summary = "Must roll back";
    invalid.societies[0].sourceHash = "a".repeat(64);
    const lastClub = invalid.societies.at(-1);
    for (const listing of invalid.events.filter(
      (item) => item.societySlug === lastClub.slug,
    ))
      listing.societySlug = extraClub.slug;
    lastClub.slug = extraClub.slug;
    lastClub.sourceHash = "b".repeat(64);
    await expect(
      sql.unsafe(renderSocietiesSql(invalid, { apply: true })),
    ).rejects.toThrow();
    await sql.unsafe("rollback");
    const [unchanged] =
      await sql`select summary from public.societies where source_id = ${snapshot.societies[0].sourceId}`;
    expect(unchanged.summary).toBe(revised.societies[0].summary);
  } finally {
    await sql.unsafe("rollback");
    await sql.begin(async (tx) => {
      await tx`delete from public.society_events where source_id in ${tx(eventKeys)}`;
      await tx`delete from public.societies where source_id in ${tx(clubKeys)}`;
    });
    await sql.end();
  }
});
