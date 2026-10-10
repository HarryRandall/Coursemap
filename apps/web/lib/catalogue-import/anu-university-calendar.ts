import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { ImportDiagnostic, ImportManifestSource } from "./import-source";

export const ANU_UNIVERSITY_CALENDAR_PARSER_VERSION =
  "anu-university-calendar-parser-v1";

export const ANU_UNIVERSITY_CALENDAR_SOURCE: ImportManifestSource = {
  name: "ANU university calendar",
  kind: "anu_university_calendar",
  baseUrl: "https://www.anu.edu.au/directories/university-calendar",
};

export type UniversityCalendarEventInput = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
};

export type UniversityCalendarManifest = {
  schemaVersion: 1;
  kind: "university_calendar";
  parserVersion: string;
  calendarYear: number;
  source: ImportManifestSource;
  document: {
    externalKey: string;
    canonicalUrl: string;
    fetchedAt: string;
    contentSha256: string;
  };
  events: UniversityCalendarEventInput[];
  diagnostics: ImportDiagnostic[];
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MONTH_ABBREVIATIONS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function normaliseText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function assertCalendarYear(calendarYear: number) {
  if (
    !Number.isInteger(calendarYear) ||
    calendarYear < 2000 ||
    calendarYear > 2200
  ) {
    throw new TypeError(
      "calendarYear must be an integer between 2000 and 2200",
    );
  }
}

export function createUniversityCalendarUrl(calendarYear: number) {
  assertCalendarYear(calendarYear);
  return `${ANU_UNIVERSITY_CALENDAR_SOURCE.baseUrl}?year=${calendarYear}`;
}

export function universityCalendarExternalKey(calendarYear: number) {
  assertCalendarYear(calendarYear);
  return `university-calendar-${calendarYear}`;
}

function contentSha256(html: string) {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

/**
 * Parse the official ANU university calendar page for one year.
 *
 * Each event row carries a `time[datetime]` value and a `.datetext` title,
 * plus a visible day and month block. The datetime date part is authoritative
 * and the visible block is used as a cross-check so a source markup change
 * surfaces as a review diagnostic instead of silently wrong data.
 */
export function parseUniversityCalendarHtml(
  html: string,
  calendarYear: number,
): {
  events: UniversityCalendarEventInput[];
  diagnostics: ImportDiagnostic[];
} {
  assertCalendarYear(calendarYear);
  const $ = load(html);
  const events: UniversityCalendarEventInput[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  const seen = new Set<string>();

  const rows = $("tr").filter((_, row) => {
    const candidate = $(row);
    return (
      candidate.find("time[datetime]").length > 0 &&
      candidate.find(".datetext").length > 0
    );
  });

  if (rows.length === 0) {
    diagnostics.push({
      code: "CALENDAR_TABLE_MISSING",
      severity: "error",
      message:
        "No calendar event rows were found; the source markup may have changed.",
      field: "events",
    });
    return { events, diagnostics };
  }

  rows.each((index, row) => {
    const candidate = $(row);
    const field = `events[${index}]`;
    const title = normaliseText(candidate.find(".datetext").first().text());
    const datetime = candidate.find("time[datetime]").first().attr("datetime");
    const dateText = normaliseText(datetime ?? "");
    const date = dateText.slice(0, 10);

    if (!title) {
      diagnostics.push({
        code: "CALENDAR_EVENT_TITLE_MISSING",
        severity: "error",
        message: "A calendar event row has no title text.",
        field,
        sourceFragment: dateText || undefined,
      });
      return;
    }

    if (!ISO_DATE_PATTERN.test(date) || !isRealIsoDate(date)) {
      diagnostics.push({
        code: "CALENDAR_EVENT_DATE_INVALID",
        severity: "error",
        message: `The calendar event "${title}" has an unreadable date.`,
        field,
        sourceFragment: dateText || undefined,
      });
      return;
    }

    if (Number.parseInt(date.slice(0, 4), 10) !== calendarYear) {
      diagnostics.push({
        code: "CALENDAR_EVENT_YEAR_MISMATCH",
        severity: "error",
        message: `The calendar event "${title}" on ${date} is outside ${calendarYear}.`,
        field,
        sourceFragment: dateText,
      });
      return;
    }

    const visibleDay = normaliseText(candidate.find(".day").first().text());
    const visibleMonth = normaliseText(
      candidate.find(".month").first().text(),
    ).toLowerCase();
    if (visibleDay && visibleMonth) {
      const expectedDay = Number.parseInt(date.slice(8, 10), 10);
      const expectedMonth =
        MONTH_ABBREVIATIONS[Number.parseInt(date.slice(5, 7), 10) - 1];
      if (
        Number.parseInt(visibleDay, 10) !== expectedDay ||
        !visibleMonth.startsWith(expectedMonth)
      ) {
        diagnostics.push({
          code: "CALENDAR_EVENT_DATE_MISMATCH",
          severity: "error",
          message: `The visible date block "${visibleDay} ${visibleMonth}" does not match ${date} for "${title}".`,
          field,
          sourceFragment: dateText,
        });
        return;
      }
    }

    const key = `${date}\u0000${title.toLowerCase()}`;
    if (seen.has(key)) {
      diagnostics.push({
        code: "CALENDAR_EVENT_DUPLICATE",
        severity: "warning",
        message: `The calendar event "${title}" on ${date} appears more than once.`,
        field,
      });
      return;
    }

    seen.add(key);
    events.push({ date, title });
  });

  if (events.length === 0) {
    diagnostics.push({
      code: "CALENDAR_EVENTS_EMPTY",
      severity: "error",
      message: `No valid calendar events were parsed for ${calendarYear}.`,
      field: "events",
    });
  }

  events.sort((a, b) =>
    a.date === b.date
      ? a.title.localeCompare(b.title)
      : a.date < b.date
        ? -1
        : 1,
  );
  return { events, diagnostics };
}

function isRealIsoDate(value: string) {
  const timestamp = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(timestamp.valueOf()) &&
    timestamp.toISOString().slice(0, 10) === value
  );
}

export type FetchUniversityCalendarOptions = {
  calendarYear: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
};

/** The calendar page is far smaller; a larger response is not the calendar. */
export const MAX_UNIVERSITY_CALENDAR_BYTES = 5 * 1024 * 1024;

function calendarTooLarge() {
  return new Error(
    `The ANU university calendar exceeds ${MAX_UNIVERSITY_CALENDAR_BYTES} bytes.`,
  );
}

async function readCalendarHtml(response: Response) {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredBytes) &&
    declaredBytes > MAX_UNIVERSITY_CALENDAR_BYTES
  )
    throw calendarTooLarge();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteSize = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      byteSize += value.byteLength;
      if (byteSize > MAX_UNIVERSITY_CALENDAR_BYTES) throw calendarTooLarge();
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchUniversityCalendarManifest({
  calendarYear,
  fetchImpl = fetch,
  now = () => new Date(),
  signal,
}: FetchUniversityCalendarOptions): Promise<UniversityCalendarManifest> {
  const canonicalUrl = createUniversityCalendarUrl(calendarYear);
  // Like the other ANU sources, the calendar is read only from its canonical
  // address, so the recorded URL is always the one that was fetched.
  const response = await fetchImpl(canonicalUrl, {
    headers: { accept: "text/html" },
    redirect: "error",
    signal,
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("The ANU university calendar redirected elsewhere.");
  }
  if (!response.ok) {
    throw new Error(
      `The ANU university calendar responded with HTTP ${response.status}.`,
    );
  }

  const html = await readCalendarHtml(response);
  const { events, diagnostics } = parseUniversityCalendarHtml(
    html,
    calendarYear,
  );

  return parseUniversityCalendarManifest({
    schemaVersion: 1,
    kind: "university_calendar",
    parserVersion: ANU_UNIVERSITY_CALENDAR_PARSER_VERSION,
    calendarYear,
    source: { ...ANU_UNIVERSITY_CALENDAR_SOURCE },
    document: {
      externalKey: universityCalendarExternalKey(calendarYear),
      canonicalUrl,
      fetchedAt: now().toISOString(),
      contentSha256: contentSha256(html),
    },
    events,
    diagnostics,
  });
}

class UniversityCalendarManifestError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super("The university calendar manifest is invalid.");
    this.name = "UniversityCalendarManifestError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlankString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Validate an untrusted manifest payload before it may touch the database. */
export function parseUniversityCalendarManifest(
  value: unknown,
): UniversityCalendarManifest {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new UniversityCalendarManifestError([
      "manifest must be a JSON object",
    ]);
  }

  if (value.schemaVersion !== 1) {
    issues.push("schemaVersion must be 1");
  }
  if (value.kind !== "university_calendar") {
    issues.push("kind must be university_calendar");
  }
  const parserVersion = nonBlankString(value.parserVersion);
  if (!parserVersion) {
    issues.push("parserVersion must be a non-blank string");
  }
  const calendarYear = value.calendarYear;
  if (
    typeof calendarYear !== "number" ||
    !Number.isInteger(calendarYear) ||
    calendarYear < 2000 ||
    calendarYear > 2200
  ) {
    issues.push("calendarYear must be an integer between 2000 and 2200");
  }

  const source = isRecord(value.source) ? value.source : null;
  const sourceName = source ? nonBlankString(source.name) : null;
  const sourceKind = source ? nonBlankString(source.kind) : null;
  const sourceBaseUrl = source ? nonBlankString(source.baseUrl) : null;
  if (!sourceName || !sourceKind || !sourceBaseUrl) {
    issues.push("source must include name, kind and baseUrl");
  }

  const document = isRecord(value.document) ? value.document : null;
  const externalKey = document ? nonBlankString(document.externalKey) : null;
  const canonicalUrl = document ? nonBlankString(document.canonicalUrl) : null;
  const fetchedAt = document ? nonBlankString(document.fetchedAt) : null;
  const sha = document ? nonBlankString(document.contentSha256) : null;
  if (!externalKey || !canonicalUrl) {
    issues.push("document must include externalKey and canonicalUrl");
  }
  if (!fetchedAt || Number.isNaN(new Date(fetchedAt).valueOf())) {
    issues.push("document.fetchedAt must be a valid timestamp");
  }
  if (!sha || !SHA256_PATTERN.test(sha)) {
    issues.push("document.contentSha256 must be a lowercase sha256 hex digest");
  }

  const events: UniversityCalendarEventInput[] = [];
  if (!Array.isArray(value.events)) {
    issues.push("events must be an array");
  } else {
    value.events.forEach((event, index) => {
      if (!isRecord(event)) {
        issues.push(`events[${index}] must be an object`);
        return;
      }
      const date = nonBlankString(event.date);
      const title = nonBlankString(event.title);
      if (!date || !ISO_DATE_PATTERN.test(date) || !isRealIsoDate(date)) {
        issues.push(`events[${index}].date must be a valid YYYY-MM-DD date`);
        return;
      }
      if (
        typeof calendarYear === "number" &&
        Number.parseInt(date.slice(0, 4), 10) !== calendarYear
      ) {
        issues.push(`events[${index}].date must fall within ${calendarYear}`);
        return;
      }
      if (!title) {
        issues.push(`events[${index}].title must be a non-blank string`);
        return;
      }
      events.push({ date, title });
    });
  }

  const diagnostics: ImportDiagnostic[] = [];
  if (!Array.isArray(value.diagnostics)) {
    issues.push("diagnostics must be an array");
  } else {
    value.diagnostics.forEach((diagnostic, index) => {
      if (!isRecord(diagnostic)) {
        issues.push(`diagnostics[${index}] must be an object`);
        return;
      }
      const code = nonBlankString(diagnostic.code);
      const message = nonBlankString(diagnostic.message);
      const severity = diagnostic.severity;
      if (
        !code ||
        !message ||
        (severity !== "warning" && severity !== "error")
      ) {
        issues.push(
          `diagnostics[${index}] must include code, message and a valid severity`,
        );
        return;
      }
      diagnostics.push({
        code,
        message,
        severity,
        field:
          typeof diagnostic.field === "string" ? diagnostic.field : undefined,
        sourceFragment:
          typeof diagnostic.sourceFragment === "string"
            ? diagnostic.sourceFragment
            : undefined,
      });
    });
  }

  if (issues.length > 0) {
    throw new UniversityCalendarManifestError(issues);
  }

  return {
    schemaVersion: 1,
    kind: "university_calendar",
    parserVersion: parserVersion as string,
    calendarYear: calendarYear as number,
    source: {
      name: sourceName as string,
      kind: sourceKind as string,
      baseUrl: sourceBaseUrl as string,
    },
    document: {
      externalKey: externalKey as string,
      canonicalUrl: canonicalUrl as string,
      fetchedAt: new Date(fetchedAt as string).toISOString(),
      contentSha256: sha as string,
    },
    events,
    diagnostics,
  };
}

export function universityCalendarErrorDiagnostics(
  manifest: UniversityCalendarManifest,
) {
  return manifest.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
}
