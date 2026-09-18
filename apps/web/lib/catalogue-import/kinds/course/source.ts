import { load } from "cheerio";
import { COURSE_CODE_PATTERN } from "./contract.ts";
import { textFingerprint } from "../../canonical.ts";

export const ANU_PROGRAMS_AND_COURSES_ORIGIN =
  "https://programsandcourses.anu.edu.au";
export const MIN_IMPORT_YEAR = 2020;
export const MAX_IMPORT_YEAR = 2030;
export const MAX_COURSE_PAGE_BYTES = 2_000_000;

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type CoursePageValidationIssue = {
  code:
    | "PAGE_NOT_FOUND_SHELL"
    | "MISSING_COURSE_CODE"
    | "COURSE_CODE_MISMATCH"
    | "MISSING_COURSE_YEAR"
    | "COURSE_YEAR_MISMATCH"
    | "MISSING_COURSE_TITLE"
    | "INVALID_CANONICAL_URL"
    | "CANONICAL_URL_MISMATCH";
  message: string;
};

export type ValidatedCoursePage = {
  code: string;
  year: number;
  title: string;
  canonicalUrl: string;
  issues: CoursePageValidationIssue[];
};

export type CoursePageValidationResult =
  | {
      valid: true;
      page: ValidatedCoursePage;
      issues: CoursePageValidationIssue[];
    }
  | { valid: false; page: null; issues: CoursePageValidationIssue[] };

export class CourseSourceError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    code: string,
    message: string,
    {
      retryable = false,
      status = null,
    }: { retryable?: boolean; status?: number | null } = {},
  ) {
    super(message);
    this.name = "CourseSourceError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export type FetchAnuCoursePageOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  now?: () => Date;
  maxBytes?: number;
};

export type FetchedAnuCoursePage = {
  sourceUrl: string;
  canonicalUrl: string;
  courseCode: string;
  year: number;
  title: string;
  html: string;
  contentSha256: string;
  byteSize: number;
  httpStatus: number;
  httpEtag: string | null;
  sourceLastModified: string | null;
  fetchedAt: string;
  validation: CoursePageValidationResult;
  sourceError: CourseSourceError | null;
};

function normaliseText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metadata(html: string, name: string) {
  const $ = load(html);
  const value = $(`meta[name="${name}"]`).first().attr("content");
  return value ? normaliseText(value) : null;
}

export function normaliseAnuCourseCode(courseCode: string) {
  const code = courseCode.trim().toUpperCase();
  if (!COURSE_CODE_PATTERN.test(code)) {
    throw new TypeError(`Invalid ANU course code: ${courseCode}`);
  }
  return code;
}

export function assertImportYear(year: number) {
  if (
    !Number.isInteger(year) ||
    year < MIN_IMPORT_YEAR ||
    year > MAX_IMPORT_YEAR
  ) {
    throw new TypeError(
      `Import year must be an integer from ${MIN_IMPORT_YEAR} through ${MAX_IMPORT_YEAR}`,
    );
  }
  return year;
}

export function createAnuCourseUrl(year: number, courseCode: string) {
  const selectedYear = assertImportYear(year);
  const code = normaliseAnuCourseCode(courseCode);
  return `${ANU_PROGRAMS_AND_COURSES_ORIGIN}/${selectedYear}/course/${code}`;
}

function normaliseOfficialUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== ANU_PROGRAMS_AND_COURSES_ORIGIN ||
    url.username ||
    url.password
  ) {
    return null;
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function isNotFoundShell(html: string) {
  const $ = load(html);
  const title = normaliseText($("title").first().text()).toLowerCase();
  const primaryHeading = normaliseText($("h1").first().text()).toLowerCase();
  const bodySample = normaliseText($("body").text())
    .slice(0, 2_000)
    .toLowerCase();
  return (
    /(?:^|\b)(?:404|page not found|not found)(?:\b|$)/.test(title) ||
    /^(?:404|page not found|not found)$/.test(primaryHeading) ||
    (bodySample.includes("the page you requested could not be found") &&
      !$("meta[name='course-code']").length)
  );
}

/**
 * Rejects ANU's HTTP-200 error shell and any page whose authoritative metadata
 * or canonical URL points at a different course/year.
 */
export function validateAnuCoursePage({
  html,
  expectedCourseCode,
  expectedYear,
  requestedUrl = createAnuCourseUrl(expectedYear, expectedCourseCode),
}: {
  html: string;
  expectedCourseCode: string;
  expectedYear: number;
  requestedUrl?: string;
}): CoursePageValidationResult {
  const code = normaliseAnuCourseCode(expectedCourseCode);
  const year = assertImportYear(expectedYear);
  const expectedUrl = createAnuCourseUrl(year, code);
  const normalisedRequestedUrl = normaliseOfficialUrl(requestedUrl);
  if (
    !normalisedRequestedUrl ||
    normalisedRequestedUrl.toLowerCase() !== expectedUrl.toLowerCase()
  ) {
    throw new TypeError(
      "requestedUrl must be the official URL for the selected course and year",
    );
  }
  if (!html.trim()) {
    return {
      valid: false,
      page: null,
      issues: [
        { code: "PAGE_NOT_FOUND_SHELL", message: "The source page was empty." },
      ],
    };
  }

  const $ = load(html);
  const issues: CoursePageValidationIssue[] = [];
  if (isNotFoundShell(html)) {
    issues.push({
      code: "PAGE_NOT_FOUND_SHELL",
      message: "ANU returned a page-not-found shell instead of course data.",
    });
  }

  const metaCode = metadata(html, "course-code")?.toUpperCase() ?? null;
  const parsedYear = Number(metadata(html, "course-year"));
  const title = metadata(html, "course-name");

  if (!metaCode || !COURSE_CODE_PATTERN.test(metaCode)) {
    issues.push({
      code: "MISSING_COURSE_CODE",
      message: "The page does not contain authoritative course-code metadata.",
    });
  } else if (metaCode !== code) {
    issues.push({
      code: "COURSE_CODE_MISMATCH",
      message: `Expected ${code}, but ANU identified the page as ${metaCode}.`,
    });
  }
  if (!Number.isInteger(parsedYear)) {
    issues.push({
      code: "MISSING_COURSE_YEAR",
      message: "The page does not contain authoritative course-year metadata.",
    });
  } else if (parsedYear !== year) {
    issues.push({
      code: "COURSE_YEAR_MISMATCH",
      message: `Expected ${year}, but ANU identified the page as ${parsedYear}.`,
    });
  }
  if (!title) {
    issues.push({
      code: "MISSING_COURSE_TITLE",
      message: "The page does not contain authoritative course-name metadata.",
    });
  }

  const canonicalHref = $("link[rel='canonical']").first().attr("href");
  const resolvedCanonical = canonicalHref
    ? normaliseOfficialUrl(new URL(canonicalHref, expectedUrl).toString())
    : expectedUrl;
  if (!resolvedCanonical) {
    issues.push({
      code: "INVALID_CANONICAL_URL",
      message:
        "The page supplied a canonical URL outside ANU Programs and Courses.",
    });
  } else if (resolvedCanonical.toLowerCase() !== expectedUrl.toLowerCase()) {
    issues.push({
      code: "CANONICAL_URL_MISMATCH",
      message:
        "The page canonical URL does not match the selected course and year.",
    });
  }

  if (issues.length > 0 || !metaCode || !title || !resolvedCanonical) {
    return { valid: false, page: null, issues };
  }
  return {
    valid: true,
    page: {
      code: metaCode,
      year: parsedYear,
      title,
      canonicalUrl: resolvedCanonical,
      issues: [],
    },
    issues: [],
  };
}

function combineSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function wait(milliseconds: number, signal?: AbortSignal) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(resolvePromise, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      rejectPromise(signal?.reason ?? new Error("The fetch was aborted."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function sourceLastModified(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function fetchAnuCoursePage(
  year: number,
  courseCode: string,
  {
    fetchImpl = fetch,
    signal,
    requestTimeoutMs = 10_000,
    retryAttempts = 1,
    retryDelayMs = 500,
    now = () => new Date(),
    maxBytes = MAX_COURSE_PAGE_BYTES,
  }: FetchAnuCoursePageOptions = {},
): Promise<FetchedAnuCoursePage> {
  const sourceUrl = createAnuCourseUrl(year, courseCode);
  const code = normaliseAnuCourseCode(courseCode);
  if (
    !Number.isInteger(retryAttempts) ||
    retryAttempts < 1 ||
    retryAttempts > 8
  ) {
    throw new TypeError("retryAttempts must be an integer between 1 and 8");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new TypeError("requestTimeoutMs must be a positive integer");
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive integer");
  }

  let lastFailure: unknown;
  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    signal?.throwIfAborted();
    try {
      const response = await fetchImpl(sourceUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Coursemap course importer",
        },
        redirect: "error",
        signal: combineSignal(requestTimeoutMs, signal),
      });

      if (
        RETRYABLE_STATUS_CODES.has(response.status) &&
        attempt < retryAttempts
      ) {
        throw new CourseSourceError(
          "RETRYABLE_HTTP_STATUS",
          `ANU returned HTTP ${response.status}.`,
          { retryable: true, status: response.status },
        );
      }
      const contentType = response.headers.get("content-type");
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        throw new CourseSourceError(
          "SOURCE_TOO_LARGE",
          `The declared source size exceeds ${maxBytes} bytes.`,
        );
      }

      const html = await response.text();
      const byteSize = Buffer.byteLength(html, "utf8");
      if (byteSize > maxBytes) {
        throw new CourseSourceError(
          "SOURCE_TOO_LARGE",
          `The downloaded source exceeds ${maxBytes} bytes.`,
        );
      }
      const validation = validateAnuCoursePage({
        html,
        expectedCourseCode: code,
        expectedYear: year,
        requestedUrl: sourceUrl,
      });
      const sourceError = RETRYABLE_STATUS_CODES.has(response.status)
        ? new CourseSourceError(
            "RETRYABLE_HTTP_STATUS",
            `ANU returned HTTP ${response.status}.`,
            { retryable: true, status: response.status },
          )
        : !response.ok
          ? new CourseSourceError(
              "HTTP_STATUS",
              `ANU returned HTTP ${response.status}.`,
              { status: response.status },
            )
          : contentType && !contentType.toLowerCase().includes("text/html")
            ? new CourseSourceError(
                "UNEXPECTED_CONTENT_TYPE",
                `Expected HTML but ANU returned ${contentType}.`,
              )
            : !validation.valid
              ? new CourseSourceError(
                  "INVALID_COURSE_PAGE",
                  validation.issues.map(({ message }) => message).join(" "),
                )
              : null;

      return {
        sourceUrl,
        canonicalUrl: validation.valid
          ? validation.page.canonicalUrl
          : sourceUrl,
        courseCode: code,
        year,
        title: validation.valid ? validation.page.title : "",
        html,
        contentSha256: textFingerprint(html),
        byteSize,
        httpStatus: response.status,
        httpEtag: response.headers.get("etag"),
        sourceLastModified: sourceLastModified(
          response.headers.get("last-modified"),
        ),
        fetchedAt: now().toISOString(),
        validation,
        sourceError,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      const retryable =
        !(error instanceof CourseSourceError) || error.retryable;
      if (!retryable || attempt === retryAttempts) throw error;
      lastFailure = error;
      await wait(retryDelayMs * 2 ** (attempt - 1), signal);
    }
  }

  throw lastFailure instanceof Error
    ? lastFailure
    : new CourseSourceError(
        "FETCH_FAILED",
        "The ANU course page could not be fetched.",
      );
}
