import { load } from "cheerio";

const COURSE_CODE = /^[A-Z]{4}\d{4}[A-Z]?$/u;
const ANU_COURSE_ORIGIN = "https://programsandcourses.anu.edu.au";

export const CBE_LIST_ONE_2024_URL =
  "https://cbe.anu.edu.au/current-students/program-planning/lists/list-1-cbe-courses/list-1-cbe-courses-2024-and-2023";

export type CbeListOneMembership = {
  year: number;
  sourceUrl: string;
  courseCodes: string[];
  duplicateCodes: string[];
};

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
          linkedCode !== code
        )
          throw new TypeError(
            `The CBE List 1 course ${code} has a mismatched ANU link.`,
          );
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
  };
}
