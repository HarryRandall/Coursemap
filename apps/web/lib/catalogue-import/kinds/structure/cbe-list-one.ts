import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { AcademicStructureRequirementRule } from "./contract.ts";

const COURSE_CODE = /^[A-Z]{4}\d{4}[A-Z]?$/u;
const ANU_COURSE_ORIGIN = "https://programsandcourses.anu.edu.au";

export const CBE_LIST_ONE_2024_URL =
  "https://cbe.anu.edu.au/current-students/program-planning/lists/list-1-cbe-courses/list-1-cbe-courses-2024-and-2023";

export type CbeListOneMembership = {
  year: number;
  sourceUrl: string;
  courseCodes: string[];
  duplicateCodes: string[];
  mismatchedCourseLinks: Array<{ listedCode: string; linkedCode: string }>;
};

export type FetchedCbeListOneMembership = CbeListOneMembership & {
  html: string;
  contentSha256: string;
  byteSize: number;
  fetchedAt: string;
  httpEtag: string | null;
  sourceLastModified: string | null;
};

/** A linked-list branch must contain exactly the verified membership. */
export function modelsCbeListOneMembership(
  rule: AcademicStructureRequirementRule | null,
  courseCodes: readonly string[],
): boolean {
  if (!rule) return false;
  if (rule.type === "group")
    return rule.children.some((child) =>
      modelsCbeListOneMembership(child, courseCodes),
    );
  if (
    rule.conditionKind !== "course_list" ||
    !/\bList 1\b/iu.test(rule.sourceText) ||
    rule.minimumUnits !== 6 ||
    rule.includesAnyCourse
  )
    return false;
  const actual = new Set(rule.courseCodes);
  return (
    actual.size === courseCodes.length &&
    courseCodes.every((code) => actual.has(code))
  );
}

const MAX_SOURCE_BYTES = 1_000_000;

/** Fetches the fixed 2024 list; callers must record this source separately. */
export async function fetchCbeListOneMembership({
  fetchImpl = fetch,
  now = () => new Date(),
  signal,
}: {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
} = {}): Promise<FetchedCbeListOneMembership> {
  const response = await fetchImpl(CBE_LIST_ONE_2024_URL, {
    headers: { Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.any(
      [AbortSignal.timeout(10_000), signal].filter(
        (value): value is AbortSignal => value !== undefined,
      ),
    ),
  });
  if (!response.ok || response.url !== CBE_LIST_ONE_2024_URL)
    throw new Error("The 2024 CBE List 1 source could not be fetched.");
  if (
    !response.headers.get("content-type")?.toLowerCase().includes("text/html")
  )
    throw new TypeError("The 2024 CBE List 1 source is not HTML.");
  const declaredBytes = Number(response.headers.get("content-length"));
  if (declaredBytes > MAX_SOURCE_BYTES)
    throw new TypeError("The 2024 CBE List 1 source exceeds the size limit.");
  const html = await response.text();
  const byteSize = Buffer.byteLength(html, "utf8");
  if (byteSize > MAX_SOURCE_BYTES)
    throw new TypeError("The 2024 CBE List 1 source exceeds the size limit.");
  return {
    ...parseCbeListOneMembership({
      html,
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2024,
    }),
    html,
    contentSha256: createHash("sha256").update(html).digest("hex"),
    byteSize,
    fetchedAt: now().toISOString(),
    httpEtag: response.headers.get("etag"),
    sourceLastModified: response.headers.get("last-modified"),
  };
}

/** Membership only: the linked current course pages cannot establish 2024 unit values. */
export function parseCbeListOneMembership({
  html,
  sourceUrl,
  year,
}: {
  html: string;
  sourceUrl: string;
  year: number;
}): CbeListOneMembership {
  if (year !== 2024 || sourceUrl !== CBE_LIST_ONE_2024_URL)
    throw new TypeError(
      "The CBE List 1 source does not match the selected catalogue year.",
    );

  const $ = load(html);
  const heading = $("h1, h2")
    .toArray()
    .map((element) => $(element).text().replace(/\s+/gu, " ").trim());
  if (!heading.some((text) => /List 1.*2024.*2023/iu.test(text)))
    throw new TypeError(
      "The CBE List 1 page does not identify the 2024 and 2023 list.",
    );

  const courseCodes = new Set<string>();
  const duplicateCodes = new Set<string>();
  const mismatchedCourseLinks: CbeListOneMembership["mismatchedCourseLinks"] =
    [];
  let courseTables = 0;
  $("table").each((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/gu, " ").trim());
    if (!/^Course code$/iu.test(headers[0] ?? "")) return;
    courseTables += 1;
    $(table)
      .find("tr")
      .slice(1)
      .each((_, row) => {
        const cell = $(row).find("th,td").first();
        const code = cell.text().replace(/\s+/gu, "").toUpperCase();
        const href = cell.find("a[href]").first().attr("href");
        if (!href)
          throw new TypeError(`The CBE List 1 course ${code} has no ANU link.`);
        let target: URL;
        try {
          target = new URL(href, sourceUrl);
        } catch {
          throw new TypeError(
            `The CBE List 1 course ${code} has no valid ANU link.`,
          );
        }
        const linkedCode = /^\/(?:\d{4}\/)?course\/([A-Z]{4}\d{4}[A-Z]?)\/?$/iu
          .exec(target.pathname)?.[1]
          .toUpperCase();
        if (
          !COURSE_CODE.test(code) ||
          target.origin !== ANU_COURSE_ORIGIN ||
          Boolean(
            target.username || target.password || target.search || target.hash,
          ) ||
          !linkedCode
        )
          throw new TypeError(
            `The CBE List 1 course ${code} has a mismatched ANU link.`,
          );
        if (linkedCode !== code)
          mismatchedCourseLinks.push({ listedCode: code, linkedCode });
        if (courseCodes.has(code)) duplicateCodes.add(code);
        courseCodes.add(code);
      });
  });
  if (courseTables === 0 || courseCodes.size === 0)
    throw new TypeError("The CBE List 1 page has no course membership tables.");

  return {
    year,
    sourceUrl,
    courseCodes: [...courseCodes],
    duplicateCodes: [...duplicateCodes],
    mismatchedCourseLinks,
  };
}
