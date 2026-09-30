import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { importSocieties } from "../scripts/societies/import.mjs";

const original = JSON.parse(
  await readFile(
    new URL("../scripts/societies/data/anu-2026-09-28.json", import.meta.url),
    "utf8",
  ),
);

test("the importer replays without changes, preserves UUIDs on updates and rolls back invalid snapshots", async () => {
  const sql = await createLocalDatabaseClient({ env: localTestEnvironment() });
  const prefix = `test-${randomUUID()}`;
  const snapshot = structuredClone(original);
  for (const club of snapshot.societies) {
    const previousSlug = club.slug;
    club.id = randomUUID();
    club.slug = `${prefix}-${club.slug}`;
    club.sourceId = `${prefix}-${club.sourceId}`;
    for (const event of snapshot.events.filter(
      (item) => item.societySlug === previousSlug,
    ))
      event.societySlug = club.slug;
  }
  for (const event of snapshot.events) {
    event.id = randomUUID();
    event.sourceId = `${prefix}-${event.sourceId}`;
  }
  const eventKeys = snapshot.events.map((event) => event.sourceId);
  const clubKeys = snapshot.societies.map((club) => club.sourceId);
  try {
    expect(await importSocieties(sql, snapshot)).toEqual({
      societiesChanged: 23,
      eventsChanged: 20,
    });
    expect(await importSocieties(sql, snapshot)).toEqual({
      societiesChanged: 0,
      eventsChanged: 0,
    });
    const revised = structuredClone(snapshot);
    revised.events[0].id = randomUUID();
    revised.events[0].title = "Revised event title";
    revised.events[0].sourceHash = "d".repeat(64);
    expect(await importSocieties(sql, revised)).toEqual({
      societiesChanged: 0,
      eventsChanged: 1,
    });
    const [stored] =
      await sql`select id, title from public.society_events where source_id = ${snapshot.events[0].sourceId}`;
    expect(stored).toEqual({
      id: snapshot.events[0].id,
      title: "Revised event title",
    });
    const invalid = structuredClone(snapshot);
    invalid.events[0].societySlug = "missing-club";
    await expect(importSocieties(sql, invalid)).rejects.toThrow(
      "Every society event needs an organiser",
    );
    const failed = structuredClone(revised);
    failed.societies[0].overview = "This change must roll back";
    failed.societies[0].sourceHash = "e".repeat(64);
    failed.events[0].category = "invalid-category";
    failed.events[0].sourceHash = "f".repeat(64);
    await expect(importSocieties(sql, failed)).rejects.toThrow();
    const [club] =
      await sql`select overview from public.societies where source_id = ${snapshot.societies[0].sourceId}`;
    expect(club.overview).toBe(snapshot.societies[0].overview);
  } finally {
    await sql.begin(async (tx) => {
      await tx`delete from public.society_events where source_id in ${tx(eventKeys)}`;
      await tx`delete from public.societies where source_id in ${tx(clubKeys)}`;
    });
    await sql.end();
  }
});
