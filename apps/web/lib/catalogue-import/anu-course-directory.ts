import {
  ANU_PROGRAMS_AND_COURSES_SOURCE,
  type ImportDiagnostic,
} from "./import-source.ts";
import {
  fetchSourceWithRetry,
  type FetchSourceOptions,
} from "./source-http.ts";

const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/;
const MAX_DIRECTORY_BYTES = 25_000_000;
export const ANU_COURSE_DIRECTORY_REQUEST_TIMEOUT_MS = 45_000;
export const ANU_COURSE_DIRECTORY_RETRY_ATTEMPTS = 1;

export type AnuCourseDirectoryEntry = {
  code: string;
  name: string | null;
  career: string | null;
  session: string | null;
  units: number | null;
  modeOfDelivery: string | null;
};

export type AnuCourseDirectory = {
  academicYear: number;
  sourceUrl: string;
  fetchedAt: string;
  totalCount: number | null;
  receivedItemCount: number;
  isComplete: boolean;
  courseCodes: string[];
  entries: AnuCourseDirectoryEntry[];
  diagnostics: ImportDiagnostic[];
};

export type FetchAnuCourseDirectoryOptions = FetchSourceOptions & {
  now?: () => Date;
};

export class AnuCourseDirectoryHttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(
      `The course directory request failed: HTTP ${status} ${statusText}`.trim(),
    );
    this.name = "AnuCourseDirectoryHttpError";
    this.status = status;
  }
}

/**
 * The search endpoint used by the official Programs and Courses catalogue
 * page. With PageSize=Infinity it returns every course for the selected
 * year in one response, which is how the site's own "show all" view works.
 */
export function createAnuCourseSearchUrl(academicYear: number) {
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2000 ||
    academicYear > 2200
  ) {
    throw new TypeError(
      "academicYear must be an integer between 2000 and 2200",
    );
  }
  const url = new URL(
    "/data/CourseSearch/GetCourses",
    ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl,
  );
  const params = {
    Source: "",
    ShowAll: "True",
    PageIndex: "0",
    MaxPageSize: "10",
    PageSize: "Infinity",
    SortColumn: "",
    SortDirection: "",
    InitailSearchRequestedFromExternalPage: "false",
    SearchText: "",
    CollegeName: "",
    ModeOfDelivery: "All Modes",
    FilterByMajors: "",
    FilterByMinors: "",
    FilterBySpecialisations: "",
    AppliedFilter: "FilterByCourses",
    SelectedYear: String(academicYear),
  };
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  for (const [name, count] of [
    ["Careers", 4],
    ["Sessions", 6],
    ["DegreeIdentifiers", 3],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      url.searchParams.set(`${name}[${index}]`, "");
    }
  }
  return url.toString();
}

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalised = value.replace(/\s+/g, " ").trim();
  return normalised || null;
}

export function parseAnuCourseDirectory(
  payload: unknown,
  academicYear: number,
): Pick<
  AnuCourseDirectory,
  | "totalCount"
  | "receivedItemCount"
  | "isComplete"
  | "courseCodes"
  | "entries"
  | "diagnostics"
> {
  const diagnostics: ImportDiagnostic[] = [];
  const entries: AnuCourseDirectoryEntry[] = [];
  const seen = new Set<string>();

  const payloadRecord =
    typeof payload === "object" && payload !== null
      ? (payload as { Items?: unknown; TotalCount?: unknown })
      : null;
  const items = Array.isArray(payloadRecord?.Items)
    ? payloadRecord.Items
    : null;
  if (items === null) {
    throw new TypeError(
      "The course search response did not contain an Items array.",
    );
  }

  const totalCount =
    typeof payloadRecord?.TotalCount === "number" &&
    Number.isInteger(payloadRecord.TotalCount) &&
    payloadRecord.TotalCount >= 0
      ? payloadRecord.TotalCount
      : null;
  const receivedItemCount = items.length;
  const hasCappedShowAllCount =
    totalCount === 500 && receivedItemCount > totalCount;
  if (totalCount === null) {
    diagnostics.push({
      code: "INVALID_DIRECTORY_TOTAL_COUNT",
      severity: "error",
      message:
        "The ANU course search response did not report a valid TotalCount.",
      field: "directory.totalCount",
    });
  } else if (receivedItemCount < totalCount) {
    diagnostics.push({
      code: "TRUNCATED_COURSE_DIRECTORY",
      severity: "error",
      message: `ANU reported ${totalCount} courses for ${academicYear}, but returned only ${receivedItemCount}.`,
      field: "directory.courseCodes",
    });
  } else if (receivedItemCount > totalCount && !hasCappedShowAllCount) {
    diagnostics.push({
      code: "INCONSISTENT_DIRECTORY_TOTAL_COUNT",
      severity: "error",
      message: `ANU reported ${totalCount} courses for ${academicYear}, but returned ${receivedItemCount}.`,
      field: "directory.courseCodes",
    });
  }
  // The Show All endpoint caps TotalCount at 500 even when PageSize=Infinity
  // returns the complete, larger result set. More rows than the reported count
  // are accepted only for that known cap. Other count mismatches fail closed.
  const isComplete =
    totalCount !== null &&
    (receivedItemCount === totalCount || hasCappedShowAllCount);

  for (const item of items) {
    const record = typeof item === "object" && item !== null ? item : {};
    const rawCode = (record as { CourseCode?: unknown }).CourseCode;
    const code =
      typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    if (!COURSE_CODE_PATTERN.test(code)) {
      diagnostics.push({
        code: "INVALID_DIRECTORY_COURSE_CODE",
        severity: "warning",
        message: `A course search result without a valid course code was ignored.`,
        field: "directory.courseCodes",
        ...(nullableText(rawCode)
          ? { sourceFragment: nullableText(rawCode)! }
          : {}),
      });
      continue;
    }
    if (seen.has(code)) {
      diagnostics.push({
        code: "DUPLICATE_DIRECTORY_COURSE_CODE",
        severity: "warning",
        message: `${code} appeared more than once in the ${academicYear} course search results.`,
        field: "directory.courseCodes",
        sourceFragment: code,
      });
      continue;
    }
    seen.add(code);
    const units = (record as { Units?: unknown }).Units;
    const name = nullableText((record as { Name?: unknown }).Name);
    if (!name) {
      diagnostics.push({
        code: "MISSING_DIRECTORY_COURSE_TITLE",
        severity: "warning",
        message: `${code} did not include a course title and was not safe to publish as a directory row.`,
        field: "directory.courseTitles",
        sourceFragment: code,
      });
    }
    entries.push({
      code,
      name,
      career: nullableText((record as { Career?: unknown }).Career),
      session: nullableText((record as { Session?: unknown }).Session),
      units: typeof units === "number" && Number.isFinite(units) ? units : null,
      modeOfDelivery: nullableText(
        (record as { ModeOfDelivery?: unknown }).ModeOfDelivery,
      ),
    });
  }

  if (entries.length === 0) {
    diagnostics.push({
      code: "EMPTY_COURSE_DIRECTORY",
      severity: "error",
      message: `The ${academicYear} course search returned no usable courses.`,
      field: "directory.courseCodes",
    });
  }

  entries.sort((left, right) => left.code.localeCompare(right.code));
  return {
    totalCount,
    receivedItemCount,
    isComplete,
    courseCodes: entries.map((entry) => entry.code),
    entries,
    diagnostics,
  };
}

/**
 * Discover every course code published for an academic year using the
 * official course search endpoint.
 */
export async function fetchAnuCourseDirectory(
  academicYear: number,
  {
    now = () => new Date(),
    requestTimeoutMs = ANU_COURSE_DIRECTORY_REQUEST_TIMEOUT_MS,
    retryAttempts = ANU_COURSE_DIRECTORY_RETRY_ATTEMPTS,
    headers,
    ...fetchOptions
  }: FetchAnuCourseDirectoryOptions = {},
): Promise<AnuCourseDirectory> {
  const sourceUrl = createAnuCourseSearchUrl(academicYear);
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
  const response = await fetchSourceWithRetry(sourceUrl, {
    ...fetchOptions,
    requestTimeoutMs,
    retryAttempts,
    accept: "application/json, text/javascript, */*; q=0.01",
    headers: requestHeaders,
  });
  if (!response.ok) {
    throw new AnuCourseDirectoryHttpError(response.status, response.statusText);
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_DIRECTORY_BYTES) {
    throw new Error(
      `The course directory response exceeded ${MAX_DIRECTORY_BYTES} bytes.`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("The course directory response was not valid JSON.");
  }

  return {
    academicYear,
    sourceUrl,
    fetchedAt: now().toISOString(),
    ...parseAnuCourseDirectory(payload, academicYear),
  };
}
