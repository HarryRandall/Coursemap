import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { convertAnuPageToMarkdown } from "../lib/catalogue-import/anu-page-markdown.ts";

async function fixture(name) {
  return readFile(
    new URL(`./fixtures/catalogue/${name}`, import.meta.url),
    "utf8",
  );
}

test("keeps the key facts a programme states only in its summary box", async () => {
  const markdown = convertAnuPageToMarkdown({
    html: await fixture("anu-2026-aacom.html"),
    frontMatter: { kind: "programme", code: "AACOM", year: 2026 },
  });
  assert.match(
    markdown,
    /^---\nkind: "programme"\ncode: "AACOM"\nyear: 2026\n---/,
  );
  assert.match(
    markdown,
    /Length 4 year full-time \(8 years part-time for domestic students only\)/,
  );
  assert.match(markdown, /SELECTION RANK 85/);
  assert.match(markdown, /ANU College of Systems and Society/);
  // The key facts are printed once per viewport on the page; one copy reaches
  // the model.
  assert.equal(markdown.match(/Length 4 year full-time/g)?.length, 1);
});

test("drops page furniture and the year switcher", async () => {
  const markdown = convertAnuPageToMarkdown({
    html: await fixture("anu-2026-adma-spec.html"),
    frontMatter: { code: "ADMA-SPEC", year: 2026 },
  });
  assert.doesNotMatch(markdown, /back to (the )?top/i);
  assert.doesNotMatch(markdown, /Academic Year/);
  assert.doesNotMatch(markdown, /<script|<style/);
});

test("writes ANU record links as their codes", async () => {
  const markdown = convertAnuPageToMarkdown({
    html: await fixture("anu-2026-adma-spec.html"),
    frontMatter: { code: "ADMA-SPEC", year: 2026 },
  });
  assert.match(markdown, /\[Mathematics\]\(MATH-MAJ\)/);
  assert.match(markdown, /\[Quantitative Biology\]\(QBIO-MAJ\)/);
});

test("labels each offering tab with its year", async () => {
  const markdown = convertAnuPageToMarkdown({
    html: await fixture("anu-2026-finm3006.html"),
    frontMatter: { code: "FINM3006", year: 2026 },
  });
  assert.match(markdown, /### Offerings in 2026/);
  assert.match(
    markdown,
    /To enrol in this course, you must have completed: FINM2001; FINM2002; and, FINM2003 or FINM3011\./,
  );
});
