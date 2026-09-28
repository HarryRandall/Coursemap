import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { validateSocietySnapshot } from "../scripts/societies/snapshot.mjs";
import { renderSocietiesSql } from "../scripts/societies/export-sql.mjs";

const snapshot = JSON.parse(
  await readFile(
    new URL("../scripts/societies/data/anu-2026-09-28.json", import.meta.url),
    "utf8",
  ),
);

test("the reviewed snapshot exports a rollback preview and requires explicit apply", () => {
  expect(() => validateSocietySnapshot(snapshot)).not.toThrow();
  expect(renderSocietiesSql(snapshot).trim()).toMatch(/rollback;$/);
  expect(renderSocietiesSql(snapshot, { apply: true }).trim()).toMatch(
    /commit;$/,
  );
});

test.each([
  [
    "duplicate club source",
    (value) => {
      value.societies[1].sourceId = value.societies[0].sourceId;
    },
  ],
  [
    "duplicate event UUID",
    (value) => {
      value.events[1].id = value.events[0].id;
    },
  ],
  [
    "unsafe link",
    (value) => {
      value.societies[0].website = "javascript:alert(1)";
    },
  ],
  [
    "invalid hash",
    (value) => {
      value.events[0].sourceHash = "unreviewed";
    },
  ],
  [
    "missing organiser",
    (value) => {
      value.events[0].societySlug = "missing";
    },
  ],
  [
    "ambiguous event time",
    (value) => {
      value.events[0].startsAt = "2026-09-28T12:00:00";
    },
  ],
])("%s is rejected before exporting SQL", (_name, change) => {
  const invalid = structuredClone(snapshot);
  change(invalid);
  expect(() => renderSocietiesSql(invalid)).toThrow();
});
