import { parseUniversityCalendarManifest } from "../../../lib/catalogue-import/anu-university-calendar.ts";
import { assertVerifiedImportDatabaseClient } from "./local-database.mjs";

const IMPORT_LOCK_NAMESPACE = "coursemap:catalogue-import";

function serialisable(value) {
  return JSON.parse(JSON.stringify(value));
}

async function upsertSource(tx, source) {
  const inserted = await tx`
    insert into public.catalogue_sources (name, kind, base_url, is_active)
    values (${source.name}, ${source.kind}, ${source.baseUrl}, true)
    on conflict (kind, base_url) do nothing
    returning id
  `;
  if (inserted.length > 0) {
    return inserted[0].id;
  }

  const [existing] = await tx`
    select id
    from public.catalogue_sources
    where kind = ${source.kind} and base_url = ${source.baseUrl}
  `;
  return existing.id;
}

// A calendar year is an academic year. Importing a calendar registers the year
// without enabling course imports for it.
async function upsertAcademicYear(tx, year) {
  const inserted = await tx`
    insert into public.academic_years (year)
    values (${year})
    on conflict (year) do nothing
    returning id
  `;
  if (inserted.length > 0) {
    return inserted[0].id;
  }

  const [existing] = await tx`
    select id from public.academic_years where year = ${year}
  `;
  return existing.id;
}

async function upsertSourcePage(tx, { academicYearId, manifest, sourceId }) {
  const { document } = manifest;
  const inserted = await tx`
    insert into public.catalogue_source_pages (
      source_id,
      academic_year_id,
      kind,
      external_key,
      canonical_url,
      content_sha256,
      fetched_at
    )
    values (
      ${sourceId},
      ${academicYearId},
      'calendar',
      ${document.externalKey},
      ${document.canonicalUrl},
      ${document.contentSha256},
      ${document.fetchedAt}
    )
    on conflict (source_id, academic_year_id, kind, external_key, content_sha256)
    do nothing
    returning id
  `;
  if (inserted.length > 0) {
    return inserted[0].id;
  }

  const [existing] = await tx`
    select id
    from public.catalogue_source_pages
    where source_id = ${sourceId}
      and academic_year_id = ${academicYearId}
      and kind = 'calendar'
      and external_key = ${document.externalKey}
      and content_sha256 = ${document.contentSha256}
  `;
  return existing.id;
}

async function upsertEvent(
  tx,
  { academicYearId, calendarYear, event, sourcePageId },
) {
  const inserted = await tx`
    insert into public.university_calendar_events (
      academic_year_id,
      calendar_year,
      event_date,
      title,
      status,
      source_page_id
    )
    values (
      ${academicYearId},
      ${calendarYear},
      ${event.date},
      ${event.title},
      'published',
      ${sourcePageId}
    )
    on conflict (calendar_year, event_date, title) do nothing
    returning id
  `;
  if (inserted.length > 0) {
    return "created";
  }

  const republished = await tx`
    update public.university_calendar_events
    set status = 'published', source_page_id = ${sourcePageId}
    where calendar_year = ${calendarYear}
      and event_date = ${event.date}
      and title = ${event.title}
      and status <> 'published'
    returning id
  `;
  return republished.length > 0 ? "updated" : "unchanged";
}

async function importManifestInTransaction(tx, manifest) {
  const lockKey = `${IMPORT_LOCK_NAMESPACE}:${manifest.source.kind}:${manifest.source.baseUrl}:${manifest.calendarYear}`;
  await tx`select pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const sourceId = await upsertSource(tx, manifest.source);
  const academicYearId = await upsertAcademicYear(tx, manifest.calendarYear);
  const sourcePageId = await upsertSourcePage(tx, {
    academicYearId,
    manifest,
    sourceId,
  });

  const errors = manifest.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const counts = {
    added: 0,
    archived: 0,
    changed: 0,
    checked: manifest.events.length,
    failed: 0,
    unchanged: 0,
  };
  let outcome = "unchanged";

  if (errors.length > 0) {
    counts.failed = manifest.events.length;
    outcome = "failed";
  } else {
    for (const event of manifest.events) {
      const action = await upsertEvent(tx, {
        academicYearId,
        calendarYear: manifest.calendarYear,
        event,
        sourcePageId,
      });
      if (action === "created") {
        counts.added += 1;
      } else if (action === "updated") {
        counts.changed += 1;
      } else {
        counts.unchanged += 1;
      }
    }

    if (manifest.events.length > 0) {
      const dates = manifest.events.map((event) => event.date);
      const titles = manifest.events.map((event) => event.title);
      const archived = await tx`
          update public.university_calendar_events
          set status = 'archived'
          where calendar_year = ${manifest.calendarYear}
            and status = 'published'
            and not exists (
              select 1
              from unnest(${dates}::date[], ${titles}::text[])
                as manifest(event_date, title)
              where manifest.event_date = university_calendar_events.event_date
                and manifest.title = university_calendar_events.title
            )
          returning id
        `;
      counts.archived = archived.length;
    }

    outcome =
      counts.added > 0
        ? "created"
        : counts.changed > 0 || counts.archived > 0
          ? "updated"
          : "unchanged";
  }

  const status = errors.length > 0 ? "failed" : "succeeded";
  const [run] = await tx`
      insert into public.university_calendar_imports (
        academic_year_id,
        source_page_id,
        parser_version,
        status,
        checked_count,
        added_count,
        changed_count,
        archived_count,
        unchanged_count,
        failed_count,
        diagnostics
      )
      values (
        ${academicYearId},
        ${sourcePageId},
        ${manifest.parserVersion},
        ${status},
        ${counts.checked},
        ${counts.added},
        ${counts.changed},
        ${counts.archived},
        ${counts.unchanged},
        ${counts.failed},
        ${tx.json(serialisable(manifest.diagnostics))}
      )
      returning id
    `;

  if (status === "succeeded") {
    await tx`
      update public.academic_years
      set calendar_published_at = now()
      where id = ${academicYearId}
    `;
  }

  return { counts, outcome, runId: run.id, status };
}

/**
 * Import a validated university calendar manifest.
 *
 * The import is idempotent: replaying the same manifest is a no-op. Published
 * events absent from a clean manifest are archived rather than deleted, and a
 * manifest carrying error diagnostics records a failed run without touching
 * event rows.
 */
export async function importUniversityCalendarManifest(sql, value) {
  const manifest = parseUniversityCalendarManifest(value);
  assertVerifiedImportDatabaseClient(sql);
  return sql.begin("read write", async (tx) => {
    await tx`set local statement_timeout = '30s'`;
    await tx`set local lock_timeout = '5s'`;
    return importManifestInTransaction(tx, manifest);
  });
}

/** Test helper mirroring withLocalCatalogueImportTransaction. */
export async function withUniversityCalendarImportTransaction(sql, callback) {
  assertVerifiedImportDatabaseClient(sql);
  if (typeof callback !== "function") {
    throw new TypeError(
      "A university calendar import transaction callback is required.",
    );
  }

  return sql.begin("read write", async (tx) => {
    await tx`set local statement_timeout = '30s'`;
    await tx`set local lock_timeout = '5s'`;
    return callback({
      importManifest: async (value) =>
        importManifestInTransaction(tx, parseUniversityCalendarManifest(value)),
      tx,
    });
  });
}
