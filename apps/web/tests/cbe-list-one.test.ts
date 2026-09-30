import { expect, test } from "vitest";
import {
  CBE_LIST_ONE_2024_URL,
  parseCbeListOneMembership,
} from "../lib/catalogue-import/kinds/structure/cbe-list-one.ts";

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
  });
});

test("CBE List 1 refuses another catalogue year or a mismatched course link", () => {
  expect(() =>
    parseCbeListOneMembership({
      html: page,
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2025,
    }),
  ).toThrow(/catalogue year/u);
  expect(() =>
    parseCbeListOneMembership({
      html: page.replace("/course/CBEA3070", "/course/CBEA3001"),
      sourceUrl: CBE_LIST_ONE_2024_URL,
      year: 2024,
    }),
  ).toThrow(/mismatched ANU link/u);
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
