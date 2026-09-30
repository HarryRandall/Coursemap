import { expect, test } from "vitest";
import {
  CBE_LIST_ONE_2024_URL,
  fetchCbeListOneMembership,
  modelsCbeListOneMembership,
  parseCbeListOneMembership,
} from "../lib/catalogue-import/kinds/structure/cbe-list-one.ts";
import type { AcademicStructureRequirementCondition } from "../lib/catalogue-import/kinds/structure/contract.ts";

const page = `
  <h1>List 1: CBE Courses 2024 and 2023</h1>
  <table><tr><th>Course Code</th><th>Course name</th><th>Unit value</th></tr>
    <tr><td><a href="https://programsandcourses.anu.edu.au/course/BUSN1001">BUSN1001</a></td><td>Business Reporting</td><td>6</td></tr>
    <tr><td><a href="https://programsandcourses.anu.edu.au/course/CBEA3070">CBEA3070</a></td><td>Internship</td><td>6 or 12</td></tr>
  </table>
  <table><tr><th>Course code</th><th>Course name</th></tr>
    <tr><td><a href="https://programsandcourses.anu.edu.au/course/FINM3009">FINM3009</a></td><td>Student Managed Fund</td></tr>
    <tr><td><a href="https://programsandcourses.anu.edu.au/course/FINM3009">FINM3009</a></td><td>Repeated row</td></tr>
  </table>`;

test("2024 CBE List 1 membership deduplicates source rows without importing unit values", () => {
  expect(
    parseCbeListOneMembership({
      html: page,
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2024,
    }),
  ).toEqual({
    year: 2024,
    sourceUrl: CBE_LIST_ONE_2024_URL,
    courseCodes: ["BUSN1001", "CBEA3070", "FINM3009"],
    duplicateCodes: ["FINM3009"],
    mismatchedCourseLinks: [],
  });
});

test("CBE List 1 refuses another catalogue year and retains a mismatched link for review", () => {
  expect(() =>
    parseCbeListOneMembership({
      html: page,
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2025,
    }),
  ).toThrow(/catalogue year/u);
  expect(
    parseCbeListOneMembership({
      html: page.replace("/course/CBEA3070", "/course/CBEA3001"),
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2024,
    }),
  ).toMatchObject({
    courseCodes: ["BUSN1001", "CBEA3070", "FINM3009"],
    mismatchedCourseLinks: [{ listedCode: "CBEA3070", linkedCode: "CBEA3001" }],
  });
});

test("CBE List 1 refuses a page without the year's membership heading", () => {
  expect(() =>
    parseCbeListOneMembership({
      html: page.replace("2024 and 2023", "2026"),
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2024,
    }),
  ).toThrow(/does not identify/u);
});

test("fetching List 1 preserves a separately attributable source snapshot", async () => {
  const response = new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      etag: '"list-2024"',
    },
  });
  Object.defineProperty(response, "url", { value: CBE_LIST_ONE_2024_URL });
  const membership = await fetchCbeListOneMembership({
    fetchImpl: (async () => response) as typeof fetch,
    now: () => new Date("2026-09-30T00:00:00Z"),
  });
  expect(membership).toMatchObject({
    year: 2024,
    sourceUrl: CBE_LIST_ONE_2024_URL,
    html: page,
    byteSize: Buffer.byteLength(page),
    fetchedAt: "2026-09-30T00:00:00.000Z",
    httpEtag: '"list-2024"',
  });
  expect(membership.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
});

test("List 1 fetch refuses a response from another URL", async () => {
  const response = new Response(page, {
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(response, "url", { value: "https://example.org/list" });
  await expect(
    fetchCbeListOneMembership({
      fetchImpl: (async () => response) as typeof fetch,
    }),
  ).rejects.toThrow(/could not be fetched/u);
});

test("the linked requirement needs the whole verified list in one finite branch", () => {
  const condition: AcademicStructureRequirementCondition = {
    type: "condition",
    key: "list-one",
    conditionKind: "course_list",
    minimumUnits: 6,
    maximumUnits: null,
    minimumCourses: null,
    courseCodes: ["BUSN1001", "ECHI2119"],
    structureKind: null,
    structureCodes: [],
    subjectCode: null,
    minimumLevel: null,
    maximumLevel: null,
    tag: null,
    freeText: null,
    scope: "part",
    includesAnyCourse: false,
    sourceText: "6 units from completion of courses from List 1.",
    sourceLocator: "Program Requirements",
  };
  expect(modelsCbeListOneMembership(condition, condition.courseCodes)).toBe(
    true,
  );
  expect(
    modelsCbeListOneMembership(condition, ["BUSN1001", "ECHI2119", "FINM3009"]),
  ).toBe(false);
  expect(
    modelsCbeListOneMembership(
      { ...condition, includesAnyCourse: true },
      condition.courseCodes,
    ),
  ).toBe(false);
  expect(
    modelsCbeListOneMembership(
      { ...condition, sourceText: "ordinary electives" },
      condition.courseCodes,
    ),
  ).toBe(false);
});
