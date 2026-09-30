import assert from "node:assert/strict";
import { test } from "vitest";
import {
  courseCodesInHtml,
  courseCodesInText,
  courseListSourceUrl,
  fetchCourseListCodes,
} from "../lib/catalogue-import/course-list-source.ts";

test("reads distinct printed course codes in order", () => {
  assert.deepEqual(
    courseCodesInText(
      "TSTL1001 Law and Society\nTSTL2002P; tstl3003\nTSTL1001 again, TSTL12345",
    ),
    ["TSTL1001", "TSTL2002P"],
  );
});

test("ignores codes in page navigation and footers", () => {
  const html = `<nav><a>NAVX1001</a></nav>
    <main><h1>Elective list</h1>
      <table><tr><th>Course code</th></tr>
        <tr><td><a href="/course/TSTL1001">TSTL1001</a></td></tr>
        <tr><td>TSTL2002</td></tr></table></main>
    <footer>FOOT1001</footer>`;
  assert.deepEqual(courseCodesInHtml(html), ["TSTL1001", "TSTL2002"]);
});

test("accepts only public HTTPS links", () => {
  assert.equal(
    courseListSourceUrl("https://example.edu/lists/one")?.href,
    "https://example.edu/lists/one",
  );
  for (const url of [
    "http://example.edu/list",
    "https://localhost/list",
    "https://127.0.0.1/list",
    "https://[::1]/list",
    "https://intranet/list",
    "https://user:secret@example.edu/list",
    "not a url",
  ])
    assert.equal(courseListSourceUrl(url), null, url);
});

test("fetches a page and reads its course codes", async () => {
  const codes = await fetchCourseListCodes("https://example.edu/list", {
    fetchImpl: async () =>
      new Response("<main>TSTL1001 and TSTL2002</main>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  });
  assert.deepEqual(codes, ["TSTL1001", "TSTL2002"]);
  await assert.rejects(
    fetchCourseListCodes("https://example.edu/list", {
      fetchImpl: async () =>
        new Response("{}", { headers: { "content-type": "application/json" } }),
    }),
    /not HTML or text/u,
  );
});
