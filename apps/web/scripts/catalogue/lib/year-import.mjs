// Imports a whole ANU catalogue year into the local database through the same
// sync pipeline as the admin bulk import. Interpretation the deterministic
// parsers cannot do is answered by a local agent: missing answers are saved as
// request files and their syncs fail until the import runs again.

import { AGENT_IMPORT_MODEL } from "../../../lib/catalogue-import/agent-extraction.ts";

export const YEAR_IMPORT_KINDS = [
  "course",
  "major",
  "minor",
  "specialisation",
  "programme",
];
const BULK_KINDS = new Set(["course", "major", "minor", "specialisation"]);
// A positive budget is required while AI is allowed; agent answers cost nothing.
const AGENT_RUN_BUDGET_USD = 0.01;

export const YEAR_IMPORT_USAGE = `Usage: pnpm catalogue:import-year --year 2026 [options]

Options:
  --kinds course,major,minor,specialisation,programme   Kinds to import (default all)
  --codes CODE,CODE                                      Only these codes
  --limit N                                              At most N records per kind
  --careers Undergraduate,Postgraduate                   Only listings with these careers
  --concurrency N                                        Records processed at once (default 6)
  --skip-directory                                       Reuse the saved ANU listing
  --reimport-held                                        Also retry untouched, unpublished agent drafts
  --refresh                                              Read every record nobody has edited again, published or not
  --answers DIR                                          Agent request and answer folder

Local database only. Records already imported, published or drafted are skipped,
so running again picks up records whose agent answers were missing.`;

function positiveInteger(flag, value) {
  const number = Number(value);
  if (!/^\d+$/.test(String(value)) || number < 1)
    throw new Error(`${flag} needs a positive whole number.`);
  return number;
}

export function parseYearImportArgs(args) {
  const options = {
    year: null,
    kinds: YEAR_IMPORT_KINDS,
    codes: null,
    limit: null,
    careers: null,
    concurrency: 6,
    skipDirectory: false,
    reimportHeld: false,
    refresh: false,
    answers: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--skip-directory") {
      options.skipDirectory = true;
      continue;
    }
    if (flag === "--reimport-held") {
      options.reimportHeld = true;
      continue;
    }
    if (flag === "--refresh") {
      options.refresh = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${flag} needs a value.\n\n${YEAR_IMPORT_USAGE}`);
    index += 1;
    if (flag === "--year") {
      options.year = positiveInteger(flag, value);
      if (options.year < 2020 || options.year > 2030)
        throw new Error("--year must be from 2020 to 2030.");
    } else if (flag === "--kinds") {
      const kinds = value.split(",").map((kind) => kind.trim());
      const unknown = kinds.filter((kind) => !YEAR_IMPORT_KINDS.includes(kind));
      if (unknown.length)
        throw new Error(`Unknown kind: ${unknown.join(", ")}.`);
      options.kinds = YEAR_IMPORT_KINDS.filter((kind) => kinds.includes(kind));
    } else if (flag === "--codes") {
      options.codes = value
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
    } else if (flag === "--careers") {
      options.careers = value
        .split(",")
        .map((career) => career.trim())
        .filter(Boolean);
    } else if (flag === "--limit") {
      options.limit = positiveInteger(flag, value);
    } else if (flag === "--concurrency") {
      options.concurrency = positiveInteger(flag, value);
    } else if (flag === "--answers") {
      options.answers = value;
    } else {
      throw new Error(`Unknown option ${flag}.\n\n${YEAR_IMPORT_USAGE}`);
    }
  }
  if (options.year === null)
    throw new Error(`--year is required.\n\n${YEAR_IMPORT_USAGE}`);
  return options;
}

/** The local preview administrator, who owns runs and publications. */
export async function readLocalAdministrator(sql) {
  const [admin] = await sql`
    select profiles.id from public.profiles
    join private.user_roles on user_roles.user_id = profiles.id
    join private.app_roles on app_roles.id = user_roles.role_id
    where app_roles.key = 'admin'
    order by lower(profiles.email) = 'test@test.com' desc, profiles.created_at
    limit 1
  `;
  if (!admin)
    throw new Error(
      "No local administrator exists. Run `pnpm db:reset` to seed one.",
    );
  return String(admin.id);
}

export async function ensureAgentImportModel(sql) {
  await sql`
    insert into public.import_models (id, name, provider, enabled, visible, input_usd_per_million, output_usd_per_million, pricing_updated_at)
    values (${AGENT_IMPORT_MODEL}, 'Local agent answers', 'Coursemap', true, false, 0, 0, now())
    on conflict (id) do update set enabled = true, input_usd_per_million = 0, output_usd_per_million = 0, pricing_updated_at = now()
  `;
}

/**
 * Listed records with no source version, publication, draft or active sync.
 * `reimportHeld` adds unpublished records whose untouched draft came from an
 * agent import, so a parser or schema fix can read them again. `refresh`
 * takes every record without an administrator's edits, so a year can be
 * replaced wholesale by agent readings.
 */
export async function readImportableRecords(
  sql,
  {
    kind,
    year,
    codes,
    limit,
    careers = null,
    reimportHeld = false,
    refresh = false,
  },
) {
  const rows = await sql`
    select records.id, codes.code from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    join public.catalogue_listings listings on listings.code_id = records.code_id and listings.academic_year_id = records.academic_year_id
    where records.kind = ${kind} and years.year = ${year}
      and (${codes === null} or codes.code = any(${codes ?? []}::text[]))
      and (${careers === null} or listings.summary->>'career' = any(${careers ?? []}::text[]))
      and records.archived_at is null and listings.is_current
      and (
        (${refresh}
          and not exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = records.id and drafts.updated_by is not null))
        or (records.published_version_id is null and records.latest_source_version_id is null
          and not exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = records.id))
        or (${reimportHeld} and records.published_version_id is null
          and exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = records.id and drafts.updated_by is null)
          and exists (select 1 from public.catalogue_syncs syncs where syncs.source_version_id = records.latest_source_version_id and syncs.requested_model = ${AGENT_IMPORT_MODEL}))
      )
      and not exists (select 1 from public.catalogue_syncs syncs where syncs.record_id = records.id and syncs.status in ('queued', 'running'))
    order by codes.code
    limit ${limit ?? 100_000}
  `;
  return rows.map((row) => ({ id: Number(row.id), code: String(row.code) }));
}

/**
 * Creates one sync per record. Courses, majors, minors and specialisations
 * also get a bulk run that publishes verified candidates, as the admin import
 * does; programmes keep the individual sync workflow.
 */
export async function createYearImportSyncs(
  sql,
  { kind, year, records, adapter, adminId },
) {
  return sql.begin(async (tx) => {
    let runId = null;
    if (BULK_KINDS.has(kind)) {
      const [run] = await tx`
        insert into public.catalogue_course_runs (kind, academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million, publish_verified, allow_ai)
        values (${kind}, ${year}, ${adminId}::uuid, ${AGENT_IMPORT_MODEL}, ${records.length}, ${AGENT_RUN_BUDGET_USD}, 0, 0, true, true)
        returning id
      `;
      runId = String(run.id);
    }
    const syncIds = [];
    for (const record of records) {
      const [sync] = await tx`
        insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version, requested_by)
        values (${record.id}, 'manual', ${AGENT_IMPORT_MODEL}, ${adapter.parserVersion}, ${adapter.promptVersion}, ${adapter.schemaVersion}, ${adminId}::uuid)
        returning id
      `;
      if (runId)
        await tx`insert into public.catalogue_course_run_items (run_id, record_id, sync_id) values (${runId}::uuid, ${record.id}, ${sync.id}::uuid)`;
      syncIds.push(String(sync.id));
    }
    return { runId, syncIds };
  });
}

/** Runs `work` over `items` with at most `concurrency` in flight. */
export async function forEachConcurrently(items, concurrency, work) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await work(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

export async function summariseSyncs(sql, syncIds) {
  const rows = await sql`
    select syncs.status, syncs.error_code, count(*)::integer as count,
      count(records.published_version_id)::integer as published
    from public.catalogue_syncs syncs
    join public.catalogue_records records on records.id = syncs.record_id
    where syncs.id = any(${syncIds}::uuid[])
    group by 1, 2 order by 3 desc
  `;
  return rows.map((row) => ({
    status: String(row.status),
    errorCode: row.error_code === null ? null : String(row.error_code),
    count: Number(row.count),
    published: Number(row.published),
  }));
}
