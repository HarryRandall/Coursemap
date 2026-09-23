import assert from "node:assert/strict";

import { test } from "vitest";

const { evaluateRequisiteExpression } =
  await import("../lib/coursemap/requisite-summary.ts");

test("evaluates level and total unit progress from completed courses", () => {
  const levelExpression = {
    kind: "level_units",
    units: 12,
    level: 2000,
    subject: "COMP",
  };
  assert.deepEqual(
    evaluateRequisiteExpression(levelExpression, [
      { code: "COMP2100F", units: 6 },
      { code: "COMP2300P", units: 6 },
      { code: "COMP1100", units: 6 },
      { code: "MATH2222", units: 6 },
    ]),
    {
      kind: "level_units",
      level: 2000,
      subject: "COMP",
      requiredUnits: 12,
      completedUnits: 12,
      satisfied: true,
    },
  );

  const totalExpression = { kind: "units_total", units: 24 };
  assert.deepEqual(
    evaluateRequisiteExpression(totalExpression, [
      { code: "COMP1100", units: 6 },
      { code: "MATH1005", units: 6 },
    ]),
    {
      kind: "units_total",
      requiredUnits: 24,
      completedUnits: 12,
      satisfied: false,
    },
  );
});

test("evaluates subject units and alternatives from completed courses only", () => {
  const expression = {
    kind: "group",
    operator: "all_of",
    conditions: [
      { kind: "subject_units", subject: "COMP", units: 24 },
      {
        kind: "group",
        operator: "any_of",
        conditions: [
          { kind: "subject_units", subject: "MATH", units: 6 },
          { kind: "course", code: "COMP1600" },
        ],
      },
    ],
  };

  assert.deepEqual(
    evaluateRequisiteExpression(expression, [
      { code: "COMP1100", units: 6 },
      { code: "COMP1110", units: 6 },
      { code: "COMP2100", units: 6 },
      { code: "COMP2300", units: 6 },
      { code: "MATH1005", units: 6 },
    ]),
    {
      kind: "group",
      operator: "all_of",
      satisfied: true,
      conditions: [
        {
          kind: "subject_units",
          subject: "COMP",
          requiredUnits: 24,
          completedUnits: 24,
          satisfied: true,
        },
        {
          kind: "group",
          operator: "any_of",
          satisfied: true,
          conditions: [
            {
              kind: "subject_units",
              subject: "MATH",
              requiredUnits: 6,
              completedUnits: 6,
              satisfied: true,
            },
            { kind: "course", code: "COMP1600", satisfied: false },
          ],
        },
      ],
    },
  );
});

test("evaluates programme enrolment against the student's programmes", () => {
  const expression = {
    kind: "group",
    operator: "all_of",
    conditions: [
      { kind: "course", code: "ACST4031" },
      {
        kind: "group",
        operator: "any_of",
        conditions: [
          {
            kind: "programme_enrolment",
            code: "HACTS",
            name: "Bachelor of Actuarial Studies (Honours)",
          },
          {
            kind: "programme_enrolment",
            code: "ASSAE",
            name: "Bachelor of Social Sciences (Honours in Actuarial Studies and Economics)",
          },
        ],
      },
    ],
  };

  const enrolled = evaluateRequisiteExpression(
    expression,
    [{ code: "ACST4031", units: 6 }],
    ["HACTS"],
  );
  assert.equal(enrolled.satisfied, true);

  const notEnrolled = evaluateRequisiteExpression(
    expression,
    [{ code: "ACST4031", units: 6 }],
    [],
  );
  assert.equal(notEnrolled.satisfied, false);
  assert.deepEqual(notEnrolled.conditions[1].conditions[0], {
    kind: "programme_enrolment",
    code: "HACTS",
    name: "Bachelor of Actuarial Studies (Honours)",
    satisfied: false,
  });
});
