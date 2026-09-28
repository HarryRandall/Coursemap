import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  validateSocietySnapshot,
  societyRow,
  societyEventRow,
} from "./snapshot.mjs";

function sqlValue(value) {
  if (value == null) return "null";
  if (Array.isArray(value))
    return `array[${value.map(sqlValue).join(", ")}]::text[]`;
  // Escape both characters because these are PostgreSQL escape-string literals.
  return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function upsert(table, row, societyId) {
  const columns = Object.keys(row);
  const values = columns.map((column) =>
    column === "society_id" ? societyId : sqlValue(row[column]),
  );
  return `insert into public.${table} (${columns.join(", ")})
values (${values.join(", ")})
on conflict (source, source_id) do update set
${columns
  .filter((column) => column !== "id")
  .map((column) => `  ${column} = excluded.${column}`)
  .join(",\n")}
where ${table}.source_hash is distinct from excluded.source_hash;`;
}

/** Export reviewed public data without connecting to any database. Preview rolls back. */
export function renderSocietiesSql(snapshot, { apply = false } = {}) {
  validateSocietySnapshot(snapshot);
  const clubs = new Map(snapshot.societies.map((club) => [club.slug, club]));
  const statements = [
    `-- Coursemap society snapshot: ${snapshot.societies.length} clubs, ${snapshot.events.length} events.`,
    `-- ${apply ? "APPLY: commits the import." : "PREVIEW: rolls back the import."} Requires migration 021_societies.sql.`,
    "-- Existing UUIDs and archive status are preserved. Missing records are never deleted.",
    "begin;",
    "set local lock_timeout = '5s';",
    "set local statement_timeout = '30s';",
    ...snapshot.societies.map((club) =>
      upsert("societies", societyRow(club, snapshot)),
    ),
    ...snapshot.events.map((event) => {
      const club = clubs.get(event.societySlug);
      const societyId = `(select id from public.societies where source = ${sqlValue(snapshot.source)} and source_id = ${sqlValue(club.sourceId)})`;
      return upsert(
        "society_events",
        societyEventRow(event, null, snapshot),
        societyId,
      );
    }),
    `select 'societies' as kind, ${snapshot.societies.length} as expected,
  count(*) as stored, count(*) filter (where status = 'published') as published
from public.societies
where source = ${sqlValue(snapshot.source)} and source_id in (${snapshot.societies.map((club) => sqlValue(club.sourceId)).join(", ")})
union all
select 'events', ${snapshot.events.length}, count(*),
  count(*) filter (where status = 'published' and exists (
    select 1 from public.societies where societies.id = society_events.society_id and societies.status = 'published'
  ))
from public.society_events
where source = ${sqlValue(snapshot.source)} and source_id in (${snapshot.events.map((event) => sqlValue(event.sourceId)).join(", ") || "null"});`,
    apply ? "commit;" : "rollback;",
  ];
  return `${statements.join("\n\n")}\n`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      snapshot: { type: "string" },
      output: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  if (!values.output)
    throw new Error("Provide --output with the SQL file path.");
  const snapshot = JSON.parse(
    await readFile(
      values.snapshot ?? new URL("./data/anu-2026-09-28.json", import.meta.url),
      "utf8",
    ),
  );
  await writeFile(
    values.output,
    renderSocietiesSql(snapshot, { apply: values.apply }),
    { flag: "wx" },
  );
  console.log(
    `Wrote ${values.apply ? "apply" : "preview"} SQL to ${values.output}. No database connection was made.`,
  );
}
