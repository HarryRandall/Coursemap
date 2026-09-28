import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createLocalDatabaseClient,
  assertVerifiedLocalDatabaseClient,
} from "../catalogue/lib/local-database.mjs";

import {
  validateSocietySnapshot,
  societyRow,
  societyEventRow,
} from "./snapshot.mjs";

/** Import a reviewed snapshot atomically; missing listings never delete data. */
export async function importSocieties(sql, snapshot) {
  assertVerifiedLocalDatabaseClient(sql);
  validateSocietySnapshot(snapshot);
  return sql.begin(async (transaction) => {
    const ids = new Map();
    let societiesChanged = 0;
    let eventsChanged = 0;
    for (const club of snapshot.societies) {
      const row = societyRow(club, snapshot);
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
      const row = societyEventRow(event, ids.get(event.societySlug), snapshot);
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
