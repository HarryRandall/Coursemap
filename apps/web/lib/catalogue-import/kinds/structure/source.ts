import { load } from "cheerio";
import { textFingerprint } from "../../canonical.ts";
import {
  assertImportYear,
  ANU_PROGRAMS_AND_COURSES_ORIGIN,
} from "../course/source.ts";
import {
  ACADEMIC_STRUCTURE_KINDS,
  normaliseAcademicStructureCode,
  type AcademicStructureKind,
} from "./contract.ts";

export const ANU_STRUCTURE_ROUTE_BY_KIND = {
  programme: "program",
  major: "major",
  minor: "minor",
  specialisation: "specialisation",
} as const satisfies Record<AcademicStructureKind, string>;

export const MAX_ACADEMIC_STRUCTURE_PAGE_BYTES = 3_000_000;

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type AcademicStructurePageValidationIssue = {
  code:
    | "PAGE_NOT_FOUND_SHELL"
    | "MISSING_STRUCTURE_KIND"
    | "STRUCTURE_KIND_MISMATCH"
    | "MISSING_STRUCTURE_CODE"
    | "STRUCTURE_CODE_MISMATCH"
    | "MISSING_STRUCTURE_YEAR"
    | "STRUCTURE_YEAR_MISMATCH"
    | "MISSING_STRUCTURE_TITLE"
    | "INVALID_CANONICAL_URL"
    | "CANONICAL_URL_MISMATCH";
  message: string;
};

export type ValidatedAcademicStructurePage = {
  kind: AcademicStructureKind;
  code: string;
  year: number;
  title: string;
  canonicalUrl: string;
};

export type AcademicStructurePageValidationResult =
  | {
      valid: true;
      page: ValidatedAcademicStructurePage;
      issues: [];
    }
  | {
      valid: false;
      page: null;
      issues: AcademicStructurePageValidationIssue[];
    };

export class AcademicStructureSourceError extends Error {
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
    this.name = "AcademicStructureSourceError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export type FetchAnuAcademicStructurePageOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  now?: () => Date;
  maxBytes?: number;
};

export type FetchedAnuAcademicStructurePage = {
  sourceUrl: string;
  canonicalUrl: string;
  kind: AcademicStructureKind;
  structureCode: string;
  year: number;
  title: string;
  html: string;
  contentSha256: string;
  byteSize: number;
  httpStatus: number;
  httpEtag: string | null;
  sourceLastModified: string | null;
  fetchedAt: string;
  validation: AcademicStructurePageValidationResult;
  sourceError: AcademicStructureSourceError | null;
};

function normaliseText(value: string | null | undefined) {
  if (!value) return null;
  const normalised = value
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalised || null;
}

function isAcademicStructureKind(
  value: string,
): value is AcademicStructureKind {
  return (ACADEMIC_STRUCTURE_KINDS as readonly string[]).includes(value);
}

export function assertAcademicStructureKind(value: string) {
  const kind = value.trim().toLowerCase();
  if (!isAcademicStructureKind(kind)) {
    throw new TypeError(`Unsupported academic structure kind: ${value}`);
  }
  return kind;
}

export function createAnuAcademicStructureUrl(
  year: number,
  kind: AcademicStructureKind,
  structureCode: string,
) {
  const selectedYear = assertImportYear(year);
  const selectedKind = assertAcademicStructureKind(kind);
  const code = normaliseAcademicStructureCode(structureCode);
  return `${ANU_PROGRAMS_AND_COURSES_ORIGIN}/${selectedYear}/${ANU_STRUCTURE_ROUTE_BY_KIND[selectedKind]}/${code}`;
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

function detectedKind(html: string) {
  const $ = load(html);
  for (const kind of ACADEMIC_STRUCTURE_KINDS) {
    const prefix = ANU_STRUCTURE_ROUTE_BY_KIND[kind];
    if ($(`meta[name="${prefix}-code"]`).length) return kind;
  }
  return null;
}

function isNotFoundShell(html: string) {
  const $ = load(html);
  const title = normaliseText($("title").first().text())?.toLowerCase() ?? "";
  const heading = normaliseText($("h1").first().text())?.toLowerCase() ?? "";
  const body = (normaliseText($("body").text()) ?? "")
    .slice(0, 2_000)
    .toLowerCase();
  return (
    /(?:^|\b)(?:404|page not found|not found)(?:\b|$)/.test(title) ||
    /^(?:404|page not found|not found)$/.test(heading) ||
    (body.includes("the page you requested could not be found") &&
      detectedKind(html) === null)
  );
}

/**
 * Reject ANU's HTTP-200 error shell and pages whose authoritative metadata or
 * canonical URL belongs to a different academic structure target.
 */
export function validateAnuAcademicStructurePage({
  html,
  expectedKind,
  expectedCode,
  expectedYear,
  requestedUrl = createAnuAcademicStructureUrl(
    expectedYear,
    expectedKind,
    expectedCode,
  ),
}: {
  html: string;
  expectedKind: AcademicStructureKind;
  expectedCode: string;
  expectedYear: number;
  requestedUrl?: string;
}): AcademicStructurePageValidationResult {
  const kind = assertAcademicStructureKind(expectedKind);
  const code = normaliseAcademicStructureCode(expectedCode);
  const year = assertImportYear(expectedYear);
  const expectedUrl = createAnuAcademicStructureUrl(year, kind, code);
  const normalisedRequestedUrl = normaliseOfficialUrl(requestedUrl);
  if (
    !normalisedRequestedUrl ||
    normalisedRequestedUrl.toLowerCase() !== expectedUrl.toLowerCase()
  ) {
    throw new TypeError(
      "requestedUrl must be the official URL for the selected academic structure and year",
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
  const issues: AcademicStructurePageValidationIssue[] = [];
  if (isNotFoundShell(html)) {
    issues.push({
      code: "PAGE_NOT_FOUND_SHELL",
      message:
        "ANU returned a page-not-found shell instead of academic structure data.",
    });
  }

  const pageKind = detectedKind(html);
  if (!pageKind) {
    issues.push({
      code: "MISSING_STRUCTURE_KIND",
      message: "The page does not contain supported structure metadata.",
    });
  } else if (pageKind !== kind) {
    issues.push({
      code: "STRUCTURE_KIND_MISMATCH",
      message: `Expected ${kind}, but ANU identified the page as ${pageKind}.`,
    });
  }

  const metadataPrefix = pageKind
    ? ANU_STRUCTURE_ROUTE_BY_KIND[pageKind]
    : ANU_STRUCTURE_ROUTE_BY_KIND[kind];
  const metadata = (name: string) =>
    normaliseText($(`meta[name="${metadataPrefix}-${name}"]`).attr("content"));
  const metaCode = metadata("code")?.toUpperCase() ?? null;
  const parsedYear = Number(metadata("year"));
  const title = metadata("name");

  if (!metaCode) {
    issues.push({
      code: "MISSING_STRUCTURE_CODE",
      message:
        "The page does not contain authoritative structure-code metadata.",
    });
  } else if (metaCode !== code) {
    issues.push({
      code: "STRUCTURE_CODE_MISMATCH",
      message: `Expected ${code}, but ANU identified the page as ${metaCode}.`,
    });
  }
  if (!Number.isInteger(parsedYear)) {
    issues.push({
      code: "MISSING_STRUCTURE_YEAR",
      message:
        "The page does not contain authoritative structure-year metadata.",
    });
  } else if (parsedYear !== year) {
    issues.push({
      code: "STRUCTURE_YEAR_MISMATCH",
      message: `Expected ${year}, but ANU identified the page as ${parsedYear}.`,
    });
  }
  if (!title) {
    issues.push({
      code: "MISSING_STRUCTURE_TITLE",
      message:
        "The page does not contain authoritative structure-name metadata.",
    });
  }

  const canonicalHref = $("link[rel='canonical']").first().attr("href");
  const canonicalUrl = canonicalHref
    ? normaliseOfficialUrl(new URL(canonicalHref, expectedUrl).toString())
    : expectedUrl;
  if (!canonicalUrl) {
    issues.push({
      code: "INVALID_CANONICAL_URL",
      message:
        "The page supplied a canonical URL outside ANU Programs and Courses.",
    });
  } else if (canonicalUrl.toLowerCase() !== expectedUrl.toLowerCase()) {
    issues.push({
      code: "CANONICAL_URL_MISMATCH",
      message:
        "The page canonical URL does not match the selected academic structure and year.",
    });
  }

  if (issues.length > 0 || !pageKind || !metaCode || !title || !canonicalUrl) {
    return { valid: false, page: null, issues };
  }

  return {
    valid: true,
    page: {
      kind: pageKind,
      code: metaCode,
      year: parsedYear,
      title,
      canonicalUrl,
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

export async function fetchAnuAcademicStructurePage(
  year: number,
  kind: AcademicStructureKind,
  structureCode: string,
  {
    fetchImpl = fetch,
    signal,
    requestTimeoutMs = 10_000,
    retryAttempts = 1,
    retryDelayMs = 500,
    now = () => new Date(),
    maxBytes = MAX_ACADEMIC_STRUCTURE_PAGE_BYTES,
  }: FetchAnuAcademicStructurePageOptions = {},
): Promise<FetchedAnuAcademicStructurePage> {
  const selectedKind = assertAcademicStructureKind(kind);
  const code = normaliseAcademicStructureCode(structureCode);
  const sourceUrl = createAnuAcademicStructureUrl(year, selectedKind, code);
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
          "User-Agent": "Coursemap academic structure importer",
        },
        redirect: "error",
        signal: combineSignal(requestTimeoutMs, signal),
      });

      if (
        RETRYABLE_STATUS_CODES.has(response.status) &&
        attempt < retryAttempts
      ) {
        throw new AcademicStructureSourceError(
          "RETRYABLE_HTTP_STATUS",
          `ANU returned HTTP ${response.status}.`,
          { retryable: true, status: response.status },
        );
      }

      const contentType = response.headers.get("content-type");
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        throw new AcademicStructureSourceError(
          "SOURCE_TOO_LARGE",
          `The declared source size exceeds ${maxBytes} bytes.`,
        );
      }

      const html = await response.text();
      const byteSize = Buffer.byteLength(html, "utf8");
      if (byteSize > maxBytes) {
        throw new AcademicStructureSourceError(
          "SOURCE_TOO_LARGE",
          `The downloaded source exceeds ${maxBytes} bytes.`,
        );
      }

      const validation = validateAnuAcademicStructurePage({
        html,
        expectedKind: selectedKind,
        expectedCode: code,
        expectedYear: year,
        requestedUrl: sourceUrl,
      });
      const sourceError = RETRYABLE_STATUS_CODES.has(response.status)
        ? new AcademicStructureSourceError(
            "RETRYABLE_HTTP_STATUS",
            `ANU returned HTTP ${response.status}.`,
            { retryable: true, status: response.status },
          )
        : !response.ok
          ? new AcademicStructureSourceError(
              "HTTP_STATUS",
              `ANU returned HTTP ${response.status}.`,
              { status: response.status },
            )
          : contentType && !contentType.toLowerCase().includes("text/html")
            ? new AcademicStructureSourceError(
                "UNEXPECTED_CONTENT_TYPE",
                `Expected HTML but ANU returned ${contentType}.`,
              )
            : !validation.valid
              ? new AcademicStructureSourceError(
                  "INVALID_ACADEMIC_STRUCTURE_PAGE",
                  validation.issues.map(({ message }) => message).join(" "),
                )
              : null;

      return {
        sourceUrl,
        canonicalUrl: validation.valid
          ? validation.page.canonicalUrl
          : sourceUrl,
        kind: selectedKind,
        structureCode: code,
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
        !(error instanceof AcademicStructureSourceError) || error.retryable;
      if (!retryable || attempt === retryAttempts) throw error;
      lastFailure = error;
      await wait(retryDelayMs * 2 ** (attempt - 1), signal);
    }
  }

  throw lastFailure instanceof Error
    ? lastFailure
    : new AcademicStructureSourceError(
        "FETCH_FAILED",
        "The ANU academic structure page could not be fetched.",
      );
}
