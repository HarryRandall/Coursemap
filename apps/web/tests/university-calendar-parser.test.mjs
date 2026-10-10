import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  ANU_UNIVERSITY_CALENDAR_PARSER_VERSION,
  ANU_UNIVERSITY_CALENDAR_SOURCE,
  createUniversityCalendarUrl,
  fetchUniversityCalendarManifest,
  MAX_UNIVERSITY_CALENDAR_BYTES,
  parseUniversityCalendarHtml,
  parseUniversityCalendarManifest,
  universityCalendarExternalKey,
  universityCalendarErrorDiagnostics,
} from "../lib/catalogue-import/anu-university-calendar.ts";

// Captured from https://www.anu.edu.au/directories/university-calendar?year=2026
// on 2026-08-19 (sha256 1deddc3888e7ef5e4fd056e92b11a7227428bc202aa510684bf67850cda9c9f9).
const FIXTURE_URL = new URL(
  "./fixtures/calendar/anu-university-calendar-2026.html",
  import.meta.url,
);

function syntheticRow({ datetime, day, month, title }) {
  return `<tr>
    <td><div class="py-2">
      <div class="dateblock-line"><div class="day">${day}</div><div class="month">${month}</div></div>
      <div class="datetext large">${title}</div>
    </div></td>
    <td><time datetime="${datetime}">2026</time></td>
  </tr>`;
}

function syntheticPage(rows) {
  return `<html><body><table><tbody>${rows.join("")}</tbody></table></body></html>`;
}

test("parses every event from the captured 2026 calendar page", async () => {
  const html = await readFile(FIXTURE_URL, "utf8");
  const { events, diagnostics } = parseUniversityCalendarHtml(html, 2026);

  assert.equal(events.length, 55);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(events[0], {
    date: "2026-01-01",
    title: "New Year's Day public holiday",
  });
  assert.deepEqual(events.at(-1), {
    date: "2026-12-31",
    title: "Spring Session ends",
  });
  assert.ok(
    events.some(
      (event) =>
        event.date === "2026-02-23" && event.title === "Semester 1 begins",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.date === "2026-03-31" && event.title === "Semester 1 census date",
    ),
  );

  const sorted = [...events].sort((a, b) =>
    a.date === b.date
      ? a.title.localeCompare(b.title)
      : a.date < b.date
        ? -1
        : 1,
  );
  assert.deepEqual(events, sorted);
});

test("reports missing rows as a source error", () => {
  const { events, diagnostics } = parseUniversityCalendarHtml(
    "<html><body><p>Nothing here</p></body></html>",
    2026,
  );
  assert.equal(events.length, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CALENDAR_TABLE_MISSING");
  assert.equal(diagnostics[0].severity, "error");
});

test("rejects rows with unreadable dates, blank titles and other years", () => {
  const html = syntheticPage([
    syntheticRow({
      datetime: "not-a-date",
      day: "01",
      month: "Jan",
      title: "Broken date",
    }),
    syntheticRow({
      datetime: "2026-02-30T12:00:00Z",
      day: "30",
      month: "Feb",
      title: "Impossible date",
    }),
    syntheticRow({
      datetime: "2026-03-01T12:00:00Z",
      day: "01",
      month: "Mar",
      title: " ",
    }),
    syntheticRow({
      datetime: "2025-06-01T12:00:00Z",
      day: "01",
      month: "Jun",
      title: "Wrong year",
    }),
    syntheticRow({
      datetime: "2026-05-04T12:00:00Z",
      day: "04",
      month: "May",
      title: "Valid event",
    }),
  ]);

  const { events, diagnostics } = parseUniversityCalendarHtml(html, 2026);
  assert.deepEqual(events, [{ date: "2026-05-04", title: "Valid event" }]);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code).sort(), [
    "CALENDAR_EVENT_DATE_INVALID",
    "CALENDAR_EVENT_DATE_INVALID",
    "CALENDAR_EVENT_TITLE_MISSING",
    "CALENDAR_EVENT_YEAR_MISMATCH",
  ]);
});

test("flags a mismatch between the datetime and the visible date block", () => {
  const html = syntheticPage([
    syntheticRow({
      datetime: "2026-05-04T12:00:00Z",
      day: "05",
      month: "May",
      title: "Shifted event",
    }),
  ]);

  const { events, diagnostics } = parseUniversityCalendarHtml(html, 2026);
  assert.equal(events.length, 0);
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["CALENDAR_EVENT_DATE_MISMATCH", "CALENDAR_EVENTS_EMPTY"],
  );
});

test("collapses duplicate rows with a warning", () => {
  const row = syntheticRow({
    datetime: "2026-05-04T12:00:00Z",
    day: "04",
    month: "May",
    title: "Repeated event",
  });
  const { events, diagnostics } = parseUniversityCalendarHtml(
    syntheticPage([row, row]),
    2026,
  );
  assert.equal(events.length, 1);
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["CALENDAR_EVENT_DUPLICATE"],
  );
  assert.equal(diagnostics[0].severity, "warning");
});

test("builds a validated manifest from a fetched page", async () => {
  const html = await readFile(FIXTURE_URL, "utf8");
  const retrievedAt = new Date("2026-08-19T00:43:00.000Z");
  const manifest = await fetchUniversityCalendarManifest({
    calendarYear: 2026,
    fetchImpl: async (url) => {
      assert.equal(url, createUniversityCalendarUrl(2026));
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    now: () => retrievedAt,
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, "university_calendar");
  assert.equal(manifest.parserVersion, ANU_UNIVERSITY_CALENDAR_PARSER_VERSION);
  assert.equal(manifest.calendarYear, 2026);
  assert.deepEqual(manifest.source, ANU_UNIVERSITY_CALENDAR_SOURCE);
  assert.equal(manifest.document.externalKey, "university-calendar-2026");
  assert.equal(manifest.document.fetchedAt, retrievedAt.toISOString());
  assert.equal(
    manifest.document.contentSha256,
    createHash("sha256").update(html, "utf8").digest("hex"),
  );
  assert.equal(manifest.events.length, 55);
  assert.deepEqual(universityCalendarErrorDiagnostics(manifest), []);
});

test("refuses a redirect without requesting its target", async () => {
  const calls = [];
  await assert.rejects(
    fetchUniversityCalendarManifest({
      calendarYear: 2026,
      fetchImpl: async (url, options) => {
        calls.push({ url, redirect: options.redirect });
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      },
    }),
    /redirected elsewhere/,
  );
  assert.deepEqual(calls, [
    { url: createUniversityCalendarUrl(2026), redirect: "error" },
  ]);
});

test("refuses a source larger than the calendar could be", async () => {
  const oversized = "x".repeat(MAX_UNIVERSITY_CALENDAR_BYTES + 1);
  for (const headers of [{}, { "content-length": String(oversized.length) }])
    await assert.rejects(
      fetchUniversityCalendarManifest({
        calendarYear: 2026,
        fetchImpl: async () =>
          new Response(oversized, { status: 200, headers }),
      }),
      /exceeds/,
    );
});

test("refuses a failed source response", async () => {
  await assert.rejects(
    fetchUniversityCalendarManifest({
      calendarYear: 2026,
      fetchImpl: async () => new Response("gone", { status: 503 }),
    }),
    /HTTP 503/,
  );
});

test("validates untrusted manifests before import", () => {
  assert.throws(
    () => parseUniversityCalendarManifest(null),
    (error) => Array.isArray(error.issues),
  );

  try {
    parseUniversityCalendarManifest({
      schemaVersion: 2,
      kind: "something_else",
      parserVersion: " ",
      calendarYear: 1999,
      source: {},
      document: { contentSha256: "zzz" },
      events: [{ date: "2026-13-40", title: "" }],
      diagnostics: [{ code: "", severity: "fatal" }],
    });
    assert.fail("expected validation to throw");
  } catch (error) {
    assert.ok(Array.isArray(error.issues));
    assert.ok(error.issues.length >= 8);
  }

  const valid = parseUniversityCalendarManifest({
    schemaVersion: 1,
    kind: "university_calendar",
    parserVersion: "test-v1",
    calendarYear: 2026,
    source: { name: "Test", kind: "test", baseUrl: "https://example.test" },
    document: {
      externalKey: universityCalendarExternalKey(2026),
      canonicalUrl: "https://example.test/?year=2026",
      fetchedAt: "2026-08-19T00:43:00.000Z",
      contentSha256: "a".repeat(64),
    },
    events: [{ date: "2026-02-23", title: "Semester 1 begins" }],
    diagnostics: [],
  });
  assert.equal(valid.events.length, 1);

  assert.throws(
    () =>
      parseUniversityCalendarManifest({
        schemaVersion: 1,
        kind: "university_calendar",
        parserVersion: "test-v1",
        calendarYear: 2026,
        source: { name: "Test", kind: "test", baseUrl: "https://example.test" },
        document: {
          externalKey: universityCalendarExternalKey(2026),
          canonicalUrl: "https://example.test/?year=2026",
          fetchedAt: "2026-08-19T00:43:00.000Z",
          contentSha256: "a".repeat(64),
        },
        events: [{ date: "2025-02-23", title: "Wrong year event" }],
        diagnostics: [],
      }),
    (error) =>
      Array.isArray(error.issues) &&
      error.issues.some((issue) => issue.includes("fall within 2026")),
  );
});
