import assert from "node:assert/strict";
import { test } from "vitest";

import {
  fetchAnuCoursePage,
  validateAnuCoursePage,
} from "../lib/catalogue-import/kinds/course/source.ts";
import { validateAnuAcademicStructurePage } from "../lib/catalogue-import/kinds/structure/source.ts";

const sources = [
  {
    label: "course",
    code: "TSTF3009",
    prefix: "course",
    missingCode: "MISSING_COURSE_YEAR",
    mismatchCode: "COURSE_YEAR_MISMATCH",
    validate(html) {
      return validateAnuCoursePage({
        html,
        expectedCourseCode: this.code,
        expectedYear: 2024,
      });
    },
  },
  {
    label: "programme",
    code: "BTEST",
    prefix: "program",
    missingCode: "MISSING_STRUCTURE_YEAR",
    mismatchCode: "STRUCTURE_YEAR_MISMATCH",
    validate(html) {
      return validateAnuAcademicStructurePage({
        html,
        expectedKind: "programme",
        expectedCode: this.code,
        expectedYear: 2024,
      });
    },
  },
];

for (const source of sources) {
  test(`${source.label} source year metadata distinguishes missing from mismatch`, () => {
    const page = (year) => `<html><head>
      <meta name="${source.prefix}-code" content="${source.code}">
      <meta name="${source.prefix}-name" content="Test Studies">
      ${year === null ? "" : `<meta name="${source.prefix}-year" content="${year}">`}
    </head><body><h1>Test Studies</h1></body></html>`;

    for (const year of [null, "2024.0"]) {
      const result = source.validate(page(year));
      assert.equal(result.valid, false);
      assert.ok(result.issues.some(({ code }) => code === source.missingCode));
      assert.ok(
        !result.issues.some(({ code }) => code === source.mismatchCode),
      );
    }
    const mismatch = source.validate(page("2025"));
    assert.equal(mismatch.valid, false);
    assert.ok(mismatch.issues.some(({ code }) => code === source.mismatchCode));
    assert.equal(source.validate(page("2024")).valid, true);
  });

  test(`${source.label} source reports malformed canonical links`, () => {
    const html = `<html><head>
      <meta name="${source.prefix}-code" content="${source.code}">
      <meta name="${source.prefix}-name" content="Test Studies">
      <meta name="${source.prefix}-year" content="2024">
      <link rel="canonical" href="http://[">
    </head><body><h1>Test Studies</h1></body></html>`;

    const result = source.validate(html);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some(({ code }) => code === "INVALID_CANONICAL_URL"),
    );
  });
}

test("course fetch requests HTML and follows only redirects to the selected ANU course", async () => {
  const html = `<html><head>
    <meta name="course-code" content="MGMT2007">
    <meta name="course-name" content="Organisational Behaviour">
    <meta name="course-year" content="2025">
  </head><body><h1>Organisational Behaviour</h1></body></html>`;
  const sourceUrl =
    "https://programsandcourses.anu.edu.au/2025/course/MGMT2007";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({
      url,
      accept: new Headers(options.headers).get("Accept"),
      redirect: options.redirect,
    });
    return {
      url: `${sourceUrl}/`,
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => html,
    };
  };
  const page = await fetchAnuCoursePage(2025, "MGMT2007", { fetchImpl });
  assert.equal(page.validation.valid, true);
  assert.deepEqual(calls, [
    { url: sourceUrl, accept: "text/html", redirect: "manual" },
  ]);

  await assert.rejects(
    fetchAnuCoursePage(2025, "MGMT2007", {
      fetchImpl: async () => ({
        url: "https://programsandcourses.anu.edu.au/2025/course/MGMT2008",
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => html,
      }),
    }),
    { code: "SOURCE_REDIRECT_MISMATCH" },
  );
});

test("course fetch refuses a redirect off the ANU course without requesting it", async () => {
  const sourceUrl =
    "https://programsandcourses.anu.edu.au/2025/course/MGMT2007";
  for (const location of [
    "http://169.254.169.254/latest/meta-data/",
    "https://programsandcourses.anu.edu.au/2025/course/MGMT2008",
  ]) {
    const calls = [];
    await assert.rejects(
      fetchAnuCoursePage(2025, "MGMT2007", {
        fetchImpl: async (url, options) => {
          calls.push({ url, redirect: options.redirect });
          return new Response(null, { status: 302, headers: { location } });
        },
      }),
      { code: "SOURCE_REDIRECT_MISMATCH" },
    );
    assert.deepEqual(calls, [{ url: sourceUrl, redirect: "manual" }]);
  }
});

test("course fetch follows a redirect to the same course page", async () => {
  const html = `<html><head>
    <meta name="course-code" content="MGMT2007">
    <meta name="course-name" content="Organisational Behaviour">
    <meta name="course-year" content="2025">
  </head><body><h1>Organisational Behaviour</h1></body></html>`;
  const sourceUrl =
    "https://programsandcourses.anu.edu.au/2025/course/MGMT2007";
  const calls = [];
  const cancelled = [];
  const page = await fetchAnuCoursePage(2025, "MGMT2007", {
    // ANU serves the page only at the trailing slash address and redirects
    // every other spelling there.
    fetchImpl: async (url) => {
      calls.push(url);
      if (url !== `${sourceUrl}/`) {
        const response = new Response("Moved", {
          status: 301,
          headers: { location: "/2025/course/MGMT2007/" },
        });
        const cancel = response.body.cancel.bind(response.body);
        response.body.cancel = async (reason) => {
          cancelled.push(url);
          return cancel(reason);
        };
        return response;
      }
      return {
        url,
        status: 200,
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => html,
      };
    },
  });
  assert.equal(page.validation.valid, true);
  assert.deepEqual(calls, [sourceUrl, `${sourceUrl}/`]);
  assert.deepEqual(cancelled, [sourceUrl]);
});
