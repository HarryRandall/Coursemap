import assert from "node:assert/strict";

import { test } from "vitest";

const { nominalProgrammeDuration, planTimelineTerms, planTimelineYears } =
  await import("../lib/coursemap/plan-timeline.ts");

test("creates each nominal degree year even when future calendar periods are absent", () => {
  const years = planTimelineYears({
    degree: { duration: 3, units: 144 },
    commencementYear: 2026,
  });
  assert.deepEqual(years, [
    { studyYear: 1, year: 2026 },
    { studyYear: 2, year: 2027 },
    { studyYear: 3, year: 2028 },
  ]);

  const terms = planTimelineTerms({
    years,
    terms: [
      {
        id: "2026-s1",
        year: 2026,
        name: "First Semester",
        shortName: "Semester 1",
        dates: "23 Feb to 29 May",
      },
      {
        id: "unscheduled",
        year: 9999,
        name: "Later",
        shortName: "Later",
        dates: "Choose when ready",
      },
    ],
  });
  assert.deepEqual(
    terms.map((term) => term.id),
    [2026, 2027, 2028]
      .flatMap((year) => [
        `${year}-summer`,
        `${year}-s1`,
        `${year}-autumn`,
        `${year}-winter`,
        `${year}-s2`,
        `${year}-spring`,
      ])
      .concat("unscheduled"),
  );
  assert.equal(terms[1].dates, "23 Feb to 29 May");
  assert.equal(terms[3].dates, "Calendar dates pending");
});

test("extends the timeline after the nominal degree duration", () => {
  const years = planTimelineYears({
    degree: { duration: null, units: 144 },
    commencementYear: 2026,
    extensionYears: 2,
  });
  assert.equal(years.length, 5);
  assert.deepEqual(years.at(-1), { studyYear: 5, year: 2030 });
});

test("does not invent a one-year timeline when planning data is absent", () => {
  assert.equal(nominalProgrammeDuration({ duration: null, units: null }), null);
  assert.deepEqual(
    planTimelineYears({
      degree: { duration: null, units: null },
      commencementYear: 2026,
      extensionYears: 4,
    }),
    [],
  );
  assert.deepEqual(
    planTimelineYears({ degree: undefined, commencementYear: 2026 }),
    [],
  );
});

test("derives a planning duration from units without replacing source data", () => {
  assert.equal(nominalProgrammeDuration({ duration: null, units: 144 }), 3);
  assert.equal(nominalProgrammeDuration({ duration: 4, units: null }), 4);
});
