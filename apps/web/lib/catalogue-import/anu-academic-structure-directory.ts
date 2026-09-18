import { createHash } from "node:crypto";
import type { AcademicStructureKind } from "./kinds/structure/contract.ts";
import {
  ANU_PROGRAMS_AND_COURSES_SOURCE,
  type ImportDiagnostic,
} from "./import-source.ts";
import {
  fetchSourceWithRetry,
  type FetchSourceOptions,
} from "./source-http.ts";

const STRUCTURE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}$/;
const MAX_DIRECTORY_BYTES = 10_000_000;

export const MIN_ACADEMIC_STRUCTURE_IMPORT_YEAR = 2020;
export const MAX_ACADEMIC_STRUCTURE_IMPORT_YEAR = 2030;
export const ANU_ACADEMIC_STRUCTURE_DIRECTORY_REQUEST_TIMEOUT_MS = 45_000;
export const ANU_ACADEMIC_STRUCTURE_DIRECTORY_RETRY_ATTEMPTS = 1;

export const ANU_ACADEMIC_STRUCTURE_DIRECTORY_KINDS = [
  "programme",
  "major",
  "minor",
  "specialisation",
] as const satisfies readonly AcademicStructureKind[];

type DirectoryEndpoint = {
  externalKey: string;
  path: string;
};

const DIRECTORY_ENDPOINTS = {
  programme: [
    {
      externalKey: "programme:undergraduate",
      path: "/data/ProgramSearch/GetProgramsUnderGraduate",
    },
    {
      externalKey: "programme:postgraduate",
      path: "/data/ProgramSearch/GetProgramsPostGraduate",
    },
    {
      externalKey: "programme:research",
      path: "/data/ProgramSearch/GetProgramsResearch",
    },
    {
      externalKey: "programme:non-award",
      path: "/data/ProgramSearch/GetProgramsNonAward",
    },
  ],
  major: [
    {
      externalKey: "major",
      path: "/data/MajorSearch/GetMajors",
    },
  ],
  minor: [
    {
      externalKey: "minor",
      path: "/data/MinorSearch/GetMinors",
    },
  ],
  specialisation: [
    {
      externalKey: "specialisation",
      path: "/data/SpecialisationSearch/GetSpecialisations",
    },
  ],
} as const satisfies Record<
  AcademicStructureKind,
  readonly DirectoryEndpoint[]
>;

const STRUCTURE_ROUTE = {
  programme: "program",
  major: "major",
  minor: "minor",
  specialisation: "specialisation",
} as const satisfies Record<AcademicStructureKind, string>;

export type AnuAcademicStructureDirectoryEntry = {
  kind: AcademicStructureKind;
  code: string;
  title: string;
  shortTitle: string | null;
  academicCareer: string | null;
  durationYears: number | null;
  units: number | null;
  modeOfDelivery: string | null;
  selectionRank: number | null;
  sourceUrl: string;
  sourcePageExternalKey: string;
};

export type AnuAcademicStructureDirectorySourcePage = {
  externalKey: string;
  sourceUrl: string;
  mediaType: string;
  contentSha256: string;
  byteSize: number;
  httpStatus: number;
  httpEtag: string | null;
  sourceLastModified: string | null;
  fetchedAt: string;
};

export type AnuAcademicStructureDirectory = {
  academicYear: number;
  kind: AcademicStructureKind;
  fetchedAt: string;
  totalCount: number | null;
  receivedItemCount: number;
  uniqueItemCount: number;
  isComplete: boolean;
  entries: AnuAcademicStructureDirectoryEntry[];
  sourcePages: AnuAcademicStructureDirectorySourcePage[];
  diagnostics: ImportDiagnostic[];
};

export type AnuAcademicStructureDirectoryPayload = {
  externalKey: string;
  sourceUrl: string;
  payload: unknown;
  payloadError?: string;
};

export type FetchAnuAcademicStructureDirectoryOptions = FetchSourceOptions & {
  now?: () => Date;
};

export class AnuAcademicStructureDirectoryHttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(
      `The academic structure directory request failed: HTTP ${status} ${statusText}`.trim(),
    );
    this.name = "AnuAcademicStructureDirectoryHttpError";
    this.status = status;
  }
}

export function isAcademicStructureDirectoryKind(
  value: unknown,
): value is AcademicStructureKind {
  return (
    typeof value === "string" &&
    ANU_ACADEMIC_STRUCTURE_DIRECTORY_KINDS.some((kind) => kind === value)
  );
}

export function assertSupportedAcademicStructureImportYear(year: number) {
  if (
    !Number.isInteger(year) ||
    year < MIN_ACADEMIC_STRUCTURE_IMPORT_YEAR ||
    year > MAX_ACADEMIC_STRUCTURE_IMPORT_YEAR
  ) {
    throw new TypeError(
      `Academic structure import years must be between ${MIN_ACADEMIC_STRUCTURE_IMPORT_YEAR} and ${MAX_ACADEMIC_STRUCTURE_IMPORT_YEAR}.`,
    );
  }
}

export function createAnuAcademicStructureSearchUrls(
  kind: AcademicStructureKind,
  academicYear: number,
) {
  if (!isAcademicStructureDirectoryKind(kind)) {
    throw new TypeError("Choose programme, major, minor or specialisation.");
  }
  assertSupportedAcademicStructureImportYear(academicYear);

  return DIRECTORY_ENDPOINTS[kind].map((endpoint) => {
    const url = new URL(endpoint.path, ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl);
    url.searchParams.set("SelectedYear", String(academicYear));
    url.searchParams.set("ShowAll", "True");
    url.searchParams.set("PageSize", "Infinity");
    return { externalKey: endpoint.externalKey, url: url.toString() };
  });
}

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalised = value.replace(/\s+/gu, " ").trim();
  return normalised || null;
}

function finiteNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function selectionRank(value: unknown) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 && number <= 999.99 ? number : null;
}

function sourceLastModified(value: string | null) {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function directoryEntryFromRecord({
  record,
  kind,
  academicYear,
  sourcePageExternalKey,
  diagnostics,
}: {
  record: Record<string, unknown>;
  kind: AcademicStructureKind;
  academicYear: number;
  sourcePageExternalKey: string;
  diagnostics: ImportDiagnostic[];
}): AnuAcademicStructureDirectoryEntry | null {
  const programme = kind === "programme";
  const rawCode = programme ? record.AcademicPlanCode : record.SubPlanCode;
  const code = nullableText(rawCode)?.toUpperCase() ?? "";
  if (!STRUCTURE_CODE_PATTERN.test(code)) {
    diagnostics.push({
      code: "INVALID_ACADEMIC_STRUCTURE_DIRECTORY_CODE",
      severity: "warning",
      message:
        "An academic structure search result without a valid code was ignored.",
      field: "directory.entries.code",
      ...(nullableText(rawCode)
        ? { sourceFragment: nullableText(rawCode)! }
        : {}),
    });
    return null;
  }

  const title = nullableText(programme ? record.ProgramName : record.Name);
  if (!title) {
    diagnostics.push({
      code: "MISSING_ACADEMIC_STRUCTURE_DIRECTORY_TITLE",
      severity: "warning",
      message: `${code} did not include a title and was ignored.`,
      field: "directory.entries.title",
      sourceFragment: code,
    });
    return null;
  }

  const rawYear = programme ? record.ProgramAcademicYear : record.Year;
  const reportedYear = finiteNumber(rawYear);
  if (reportedYear === null) {
    diagnostics.push({
      code: "MISSING_ACADEMIC_STRUCTURE_DIRECTORY_YEAR",
      severity: "warning",
      message: `${code} did not report its academic year.`,
      field: "directory.entries.academicYear",
      sourceFragment: code,
    });
  } else if (reportedYear !== academicYear) {
    diagnostics.push({
      code: "ACADEMIC_STRUCTURE_DIRECTORY_YEAR_MISMATCH",
      severity: "warning",
      message: `${code} reported ${reportedYear} in the ${academicYear} directory and was ignored.`,
      field: "directory.entries.academicYear",
      sourceFragment: code,
    });
    return null;
  }

  return {
    kind,
    code,
    title,
    shortTitle: programme ? nullableText(record.ShortProgramName) : null,
    academicCareer: nullableText(
      programme ? record.AcademicCareer : record.Career,
    ),
    durationYears: programme ? positiveNumber(record.Duration) : null,
    units: programme ? null : positiveNumber(record.Units),
    modeOfDelivery: programme ? nullableText(record.ModeOfDelivery) : null,
    selectionRank: programme ? selectionRank(record.SelectionRank) : null,
    sourceUrl: new URL(
      `/${academicYear}/${STRUCTURE_ROUTE[kind]}/${encodeURIComponent(code)}`,
      ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl,
    ).toString(),
    sourcePageExternalKey,
  };
}

/**
 * Parse the current ANU directory responses for one structure kind. ANU's
 * subplan TotalCount includes rows not returned by the year-filtered result,
 * so it is recorded but never used to decide whether those responses are
 * complete. Programme endpoint counts are exact and remain a useful guard.
 */
export function parseAnuAcademicStructureDirectory(
  kind: AcademicStructureKind,
  academicYear: number,
  payloads: readonly AnuAcademicStructureDirectoryPayload[],
): Pick<
  AnuAcademicStructureDirectory,
  | "totalCount"
  | "receivedItemCount"
  | "uniqueItemCount"
  | "isComplete"
  | "entries"
  | "diagnostics"
> {
  if (!isAcademicStructureDirectoryKind(kind)) {
    throw new TypeError("Choose programme, major, minor or specialisation.");
  }
  assertSupportedAcademicStructureImportYear(academicYear);

  const diagnostics: ImportDiagnostic[] = [];
  const entries: AnuAcademicStructureDirectoryEntry[] = [];
  const payloadByKey = new Map<string, AnuAcademicStructureDirectoryPayload>();
  let isComplete = true;
  let receivedItemCount = 0;
  let totalCount = 0;
  let hasValidTotalCount = true;

  for (const payload of payloads) {
    if (payloadByKey.has(payload.externalKey)) {
      diagnostics.push({
        code: "DUPLICATE_ACADEMIC_STRUCTURE_DIRECTORY_ENDPOINT",
        severity: "error",
        message: `${payload.externalKey} was supplied more than once.`,
        field: "directory.sourcePages",
        sourceFragment: payload.externalKey,
      });
      isComplete = false;
      continue;
    }
    payloadByKey.set(payload.externalKey, payload);
  }

  const expectedEndpoints = DIRECTORY_ENDPOINTS[kind];
  for (const endpoint of expectedEndpoints) {
    const source = payloadByKey.get(endpoint.externalKey);
    if (!source) {
      diagnostics.push({
        code: "MISSING_ACADEMIC_STRUCTURE_DIRECTORY_ENDPOINT",
        severity: "error",
        message: `${endpoint.externalKey} could not be fetched.`,
        field: "directory.sourcePages",
        sourceFragment: endpoint.externalKey,
      });
      isComplete = false;
      continue;
    }
    if (source.payloadError) {
      diagnostics.push({
        code: "INVALID_ACADEMIC_STRUCTURE_DIRECTORY_RESPONSE",
        severity: "error",
        message: `${endpoint.externalKey}: ${source.payloadError}`,
        field: "directory.sourcePages",
        sourceFragment: source.sourceUrl,
      });
      isComplete = false;
      continue;
    }

    const payload =
      typeof source.payload === "object" && source.payload !== null
        ? (source.payload as { Items?: unknown; TotalCount?: unknown })
        : null;
    const items = Array.isArray(payload?.Items) ? payload.Items : null;
    if (!items) {
      diagnostics.push({
        code: "INVALID_ACADEMIC_STRUCTURE_DIRECTORY_ITEMS",
        severity: "error",
        message: `${endpoint.externalKey} did not contain an Items array.`,
        field: "directory.entries",
        sourceFragment: source.sourceUrl,
      });
      isComplete = false;
      continue;
    }

    receivedItemCount += items.length;
    const endpointTotal = finiteNumber(payload?.TotalCount);
    const validEndpointTotal =
      endpointTotal !== null &&
      Number.isInteger(endpointTotal) &&
      endpointTotal >= 0;
    if (validEndpointTotal) totalCount += endpointTotal;
    else hasValidTotalCount = false;

    if (kind === "programme") {
      if (!validEndpointTotal) {
        diagnostics.push({
          code: "INVALID_PROGRAMME_DIRECTORY_TOTAL_COUNT",
          severity: "error",
          message: `${endpoint.externalKey} did not report a valid TotalCount.`,
          field: "directory.totalCount",
          sourceFragment: source.sourceUrl,
        });
        isComplete = false;
      } else if (endpointTotal !== items.length) {
        diagnostics.push({
          code: "INCOMPLETE_PROGRAMME_DIRECTORY_ENDPOINT",
          severity: "error",
          message: `${endpoint.externalKey} reported ${endpointTotal} programmes but returned ${items.length}.`,
          field: "directory.entries",
          sourceFragment: source.sourceUrl,
        });
        isComplete = false;
      }
    }

    for (const item of items) {
      const record =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      const entry = directoryEntryFromRecord({
        record,
        kind,
        academicYear,
        sourcePageExternalKey: endpoint.externalKey,
        diagnostics,
      });
      if (entry) entries.push(entry);
    }
  }

  const deduplicated = new Map<string, AnuAcademicStructureDirectoryEntry>();
  for (const entry of entries) {
    if (deduplicated.has(entry.code)) {
      diagnostics.push({
        code: "DUPLICATE_ACADEMIC_STRUCTURE_DIRECTORY_CODE",
        severity: "warning",
        message: `${entry.code} appeared more than once in the ${academicYear} ${kind} directory.`,
        field: "directory.entries.code",
        sourceFragment: entry.code,
      });
      continue;
    }
    deduplicated.set(entry.code, entry);
  }

  const uniqueEntries = [...deduplicated.values()].sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  return {
    totalCount: hasValidTotalCount ? totalCount : null,
    receivedItemCount,
    uniqueItemCount: uniqueEntries.length,
    isComplete,
    entries: uniqueEntries,
    diagnostics,
  };
}

async function fetchDirectoryEndpoint(
  endpoint: { externalKey: string; url: string },
  fetchedAt: string,
  {
    requestTimeoutMs,
    retryAttempts,
    headers,
    ...fetchOptions
  }: FetchSourceOptions,
) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("X-Requested-With")) {
    requestHeaders.set("X-Requested-With", "XMLHttpRequest");
  }
  if (!requestHeaders.has("Referer")) {
    requestHeaders.set(
      "Referer",
      `${ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl}/catalogue`,
    );
  }
  const response = await fetchSourceWithRetry(endpoint.url, {
    ...fetchOptions,
    requestTimeoutMs,
    retryAttempts,
    accept: "application/json, text/javascript, */*; q=0.01",
    headers: requestHeaders,
  });
  if (!response.ok) {
    throw new AnuAcademicStructureDirectoryHttpError(
      response.status,
      response.statusText,
    );
  }

  const body = await response.text();
  const byteSize = Buffer.byteLength(body, "utf8");
  if (byteSize > MAX_DIRECTORY_BYTES) {
    throw new Error(
      `The ${endpoint.externalKey} directory response exceeded ${MAX_DIRECTORY_BYTES} bytes.`,
    );
  }

  let payload: unknown = null;
  let payloadError: string | undefined;
  try {
    payload = JSON.parse(body);
  } catch {
    payloadError = "The response was not valid JSON.";
  }

  return {
    parsed: {
      externalKey: endpoint.externalKey,
      sourceUrl: endpoint.url,
      payload,
      ...(payloadError ? { payloadError } : {}),
    } satisfies AnuAcademicStructureDirectoryPayload,
    sourcePage: {
      externalKey: endpoint.externalKey,
      sourceUrl: endpoint.url,
      mediaType: response.headers.get("content-type") ?? "application/json",
      contentSha256: createHash("sha256").update(body, "utf8").digest("hex"),
      byteSize,
      httpStatus: response.status,
      httpEtag: response.headers.get("etag"),
      sourceLastModified: sourceLastModified(
        response.headers.get("last-modified"),
      ),
      fetchedAt,
    } satisfies AnuAcademicStructureDirectorySourcePage,
  };
}

/** Fetch one complete year directory from the official ANU search endpoints. */
export async function fetchAnuAcademicStructureDirectory(
  kind: AcademicStructureKind,
  academicYear: number,
  {
    now = () => new Date(),
    requestTimeoutMs = ANU_ACADEMIC_STRUCTURE_DIRECTORY_REQUEST_TIMEOUT_MS,
    retryAttempts = ANU_ACADEMIC_STRUCTURE_DIRECTORY_RETRY_ATTEMPTS,
    ...fetchOptions
  }: FetchAnuAcademicStructureDirectoryOptions = {},
): Promise<AnuAcademicStructureDirectory> {
  const endpoints = createAnuAcademicStructureSearchUrls(kind, academicYear);
  const fetchedAt = now().toISOString();
  const results = await Promise.allSettled(
    endpoints.map((endpoint) =>
      fetchDirectoryEndpoint(endpoint, fetchedAt, {
        ...fetchOptions,
        requestTimeoutMs,
        retryAttempts,
      }),
    ),
  );

  const successful = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (successful.length === 0) {
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    const allPermanentNoData =
      failures.length > 0 &&
      failures.every(
        (failure) =>
          failure instanceof AnuAcademicStructureDirectoryHttpError &&
          (failure.status === 404 || failure.status === 410),
      );
    const failure = allPermanentNoData
      ? failures[0]
      : (failures.find(
          (candidate) =>
            !(candidate instanceof AnuAcademicStructureDirectoryHttpError) ||
            (candidate.status !== 404 && candidate.status !== 410),
        ) ?? failures[0]);
    throw failure instanceof Error
      ? failure
      : new Error("The academic structure directory could not be fetched.");
  }

  const payloads: AnuAcademicStructureDirectoryPayload[] = [];
  const sourcePages: AnuAcademicStructureDirectorySourcePage[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      payloads.push(result.value.parsed);
      sourcePages.push(result.value.sourcePage);
      continue;
    }
    payloads.push({
      externalKey: endpoints[index]!.externalKey,
      sourceUrl: endpoints[index]!.url,
      payload: null,
      payloadError:
        result.reason instanceof Error
          ? result.reason.message
          : "The endpoint could not be fetched.",
    });
  }

  return {
    academicYear,
    kind,
    fetchedAt,
    sourcePages,
    ...parseAnuAcademicStructureDirectory(kind, academicYear, payloads),
  };
}
