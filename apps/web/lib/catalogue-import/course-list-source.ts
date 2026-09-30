import { load } from "cheerio";
import { fetchSourceWithRetry } from "./source-http.ts";

const COURSE_CODE = /\b[A-Z]{4}\d{4}[A-Z]?\b/gu;
const MAX_SOURCE_BYTES = 2_000_000;

/** Every distinct course code in printed order. Codes are matched as printed, in capitals. */
export function courseCodesInText(text: string): string[] {
  return [...new Set(text.match(COURSE_CODE) ?? [])];
}

/** Page chrome is dropped so navigation and footer links do not join the list. */
export function courseCodesInHtml(html: string): string[] {
  const $ = load(html);
  $("script, style, noscript, nav, header, footer").remove();
  const main = $("main").first();
  return courseCodesInText((main.length ? main : $("body")).text());
}

/**
 * Only public HTTPS hosts can be fetched, so an administrator cannot point
 * the server at itself or a private network by name.
 */
export function courseListSourceUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^[\d.]+$/u.test(host) ||
    host.startsWith("[")
  )
    return null;
  return url;
}

export async function fetchCourseListCodes(
  sourceUrl: string,
  {
    fetchImpl,
    signal,
  }: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<string[]> {
  const url = courseListSourceUrl(sourceUrl);
  if (!url)
    throw new TypeError("The course list link must be a public HTTPS page.");
  const response = await fetchSourceWithRetry(url.href, {
    fetchImpl,
    signal,
    retryAttempts: 2,
    requestTimeoutMs: 15_000,
  });
  if (!response.ok)
    throw new Error(`The course list page returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("html") && !contentType.startsWith("text/"))
    throw new TypeError("The course list page is not HTML or text.");
  if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES)
    throw new TypeError("The course list page is too large.");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_SOURCE_BYTES)
    throw new TypeError("The course list page is too large.");
  return contentType.includes("html")
    ? courseCodesInHtml(body)
    : courseCodesInText(body);
}
