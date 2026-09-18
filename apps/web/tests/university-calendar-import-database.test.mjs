import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  ANU_UNIVERSITY_CALENDAR_PARSER_VERSION,
  ANU_UNIVERSITY_CALENDAR_SOURCE,
  parseUniversityCalendarHtml,
  universityCalendarExternalKey,
} from "../lib/catalogue-import/anu-university-calendar.ts";
import { withUniversityCalendarImportTransaction } from "../scripts/catalogue/lib/calendar-importer.mjs";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";

const calendarYear = 2026;
const fetchedAt = "2026-08-19T00:43:00.000Z";
const rollbackSignal = new Error(
  "Intentional university calendar integration test rollback",
);

const fixtureHtml = await readFile(
  new URL(
    "./fixtures/calendar/anu-university-calendar-2026.html",
    import.meta.url,
  ),
  "utf8",
);

function buildManifest(events, contentSuffix = "") {
  return {
    schemaVersion: 1,
    kind: "university_calendar",
    parserVersion: ANU_UNIVERSITY_CALENDAR_PARSER_VERSION,
    calendarYear,
    source: { ...ANU_UNIVERSITY_CALENDAR_SOURCE },
    document: {
      externalKey: universityCalendarExternalKey(calendarYear),
      canonicalUrl: `${ANU_UNIVERSITY_CALENDAR_SOURCE.baseUrl}?year=${calendarYear}`,
      fetchedAt,
      contentSha256: createHash("sha256")
        .update(`${fixtureHtml}${contentSuffix}`, "utf8")
        .digest("hex"),
    },
    events,
    diagnostics: [],
  };
}

test("imports, replays and archives university calendar events", async () => {
  const { events, diagnostics } = parseUniversityCalendarHtml(
    fixtureHtml,
    calendarYear,
  );
  assert.deepEqual(diagnostics, []);
  assert.equal(events.length, 55);

  const sql = await createLocalDatabaseClient();
  try {
    await assert.rejects(
      withUniversityCalendarImportTransaction(
        sql,
        async ({ importManifest, tx }) => {
          const cleanSlate = await tx`
          delete from public.university_calendar_events
          where calendar_year = ${calendarYear}
        `;
          assert.ok(cleanSlate.count >= 0);

          const first = await importManifest(buildManifest(events));
          assert.equal(first.status, "succeeded");
          assert.deepEqual(first.counts, {
            added: 55,
            archived: 0,
            changed: 0,
            checked: 55,
            failed: 0,
            unchanged: 0,
          });

          const published = await tx`
          select count(*)::int as count
          from public.university_calendar_events
          where calendar_year = ${calendarYear} and status = 'published'
        `;
          assert.equal(published[0].count, 55);

          const replay = await importManifest(buildManifest(events));
          assert.equal(replay.status, "succeeded");
          assert.deepEqual(replay.counts, {
            added: 0,
            archived: 0,
            changed: 0,
            checked: 55,
            failed: 0,
            unchanged: 55,
          });

          const revised = [
            ...events.slice(1),
            { date: "2026-12-15", title: "A brand new key date" },
          ];
          const revision = await importManifest(
            buildManifest(revised, "\nrevised"),
          );
          assert.equal(revision.status, "succeeded");
          assert.deepEqual(revision.counts, {
            added: 1,
            archived: 1,
            changed: 0,
            checked: 55,
            failed: 0,
            unchanged: 54,
          });

          const archivedRows = await tx`
          select title
          from public.university_calendar_events
          where calendar_year = ${calendarYear} and status = 'archived'
        `;
          assert.deepEqual(
            archivedRows.map((row) => row.title),
            [events[0].title],
          );

          const restored = await importManifest(
            buildManifest(events, "\nrestored"),
          );
          assert.equal(restored.status, "succeeded");
          assert.equal(restored.counts.changed, 1);
          assert.equal(restored.counts.archived, 1);

          const failing = await importManifest({
            ...buildManifest(events, "\nfailing"),
            diagnostics: [
              {
                code: "CALENDAR_TABLE_MISSING",
                severity: "error",
                message: "Synthetic failure for the integration test.",
              },
            ],
          });
          assert.equal(failing.status, "failed");
          assert.equal(failing.counts.failed, 55);

          const runs = await tx`
          select imports.status, imports.archived_count
          from public.university_calendar_imports as imports
          join public.academic_years as years on years.id = imports.academic_year_id
          where years.year = ${calendarYear}
          order by imports.imported_at
        `;
          assert.deepEqual(runs.map((row) => row.status).slice(-5), [
            "succeeded",
            "succeeded",
            "succeeded",
            "succeeded",
            "failed",
          ]);
          assert.deepEqual(
            runs.map((row) => row.archived_count).slice(-5),
            [0, 0, 1, 1, 0],
          );

          const [year] = await tx`
          select calendar_published_at
          from public.academic_years
          where year = ${calendarYear}
        `;
          assert.ok(year.calendar_published_at instanceof Date);

          throw rollbackSignal;
        },
      ),
      (error) => error === rollbackSignal,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
});
