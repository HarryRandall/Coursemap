import { expect, test } from "vitest";
import type {
  CatalogueRecord,
  ReviewEntry,
  ReviewTarget,
} from "@/lib/coursemap/admin-catalogue-record";
import { anuSourceLocation } from "@/ui/admin/catalogue/anu-source";
import {
  flagFieldLabel,
  groupChanges,
  groupFlags,
  recordNextStep,
  reviewSummary,
} from "@/ui/admin/catalogue/review-state";

let nextId = 1;

function entry(overrides: Partial<ReviewEntry>): ReviewEntry {
  return {
    id: nextId++,
    entryKind: "change",
    fieldPath: "course.details.title",
    oldValue: null,
    newValue: null,
    severity: null,
    isBlocking: false,
    issueCode: null,
    summary: null,
    sourceLocator: null,
    sourceExcerpt: null,
    status: "open",
    resolutionNote: null,
    resolvedAt: null,
    ...overrides,
  };
}

function target(overrides: Partial<ReviewTarget> = {}): ReviewTarget {
  return {
    id: "target-1",
    runId: "run-1",
    runNumber: 3,
    status: "ready",
    changeKind: "changed",
    createdAt: "2026-03-01T00:00:00Z",
    completedAt: "2026-03-01T00:01:00Z",
    appliedAt: null,
    baselineSnapshotId: 10,
    candidateSnapshotId: 11,
    entries: [],
    ...overrides,
  };
}

function record(overrides: Partial<CatalogueRecord> = {}): CatalogueRecord {
  return {
    kind: "course",
    code: "COMP3600",
    academicYear: 2026,
    itemId: 1,
    itemYearId: 1,
    itemYearPublicId: "iy_1",
    title: "Algorithms",
    draftSnapshotId: null,
    publishedSnapshotId: null,
    archivedAt: null,
    publishBlockers: [],
    snapshots: [],
    publications: [],
    reviews: [],
    ...overrides,
  };
}

test("a flag's leaf key is named from the field label map", () => {
  // Changes carry a full path, flags only the key the extractor used.
  expect(flagFieldLabel("eftsl")).toBe("EFTSL");
  expect(flagFieldLabel("prescribedTexts")).toBe("Prescribed texts");
  expect(flagFieldLabel("course.details.units")).toBe("Units");
  // Nothing in the map ends in this key, so the key itself is made readable.
  expect(flagFieldLabel("requisites.prerequisiteText")).toBe(
    "Prerequisite text",
  );
});

test("blocking flags stay separate and repeated warnings collapse by kind", () => {
  const flags = [
    entry({ entryKind: "flag", issueCode: "INVALID", isBlocking: true }),
    ...["introduction", "description", "fees"].map((fieldPath) =>
      entry({ entryKind: "flag", issueCode: "CONFLICT", fieldPath }),
    ),
    entry({ entryKind: "flag", issueCode: "EVIDENCE_MISSING" }),
  ];
  const { blocking, groups } = groupFlags(flags);

  expect(blocking).toHaveLength(1);
  expect(groups.map((group) => [group.label, group.entries.length])).toEqual([
    ["Model disagreed with the parser", 3],
    ["No supporting excerpt", 1],
  ]);
  expect(groups[0]?.open).toHaveLength(3);
});

test("changes group by the part of the record they belong to", () => {
  const groups = groupChanges([
    entry({ fieldPath: "course.details.title" }),
    entry({ fieldPath: "course.sessions" }),
    entry({ fieldPath: "requirements.prerequisite" }),
    entry({ fieldPath: "course.details.units", status: "accepted" }),
  ]);

  expect(groups.map((group) => group.label)).toEqual([
    "Details",
    "Requirements",
    "Lists",
  ]);
  expect(groups[0]?.entries).toHaveLength(2);
  expect(groups[0]?.open).toHaveLength(1);
  // The whole-collection constraint is stated once, above the rows it binds.
  expect(groups[2]?.note).toContain("whole list");
});

test("a run reports what is left rather than what it contains", () => {
  const summary = reviewSummary(
    target({
      entries: [
        entry({ status: "accepted" }),
        entry({ fieldPath: "course.fees" }),
        entry({ entryKind: "flag", issueCode: "CONFLICT" }),
      ],
    }),
  );

  expect(summary.headline).toBe("1 of 2 changes still to decide");
  expect(summary.decided).toBe(1);
  expect(summary.actionable).toBe(true);
});

test("a settled run asks for nothing and collapses", () => {
  const summary = reviewSummary(
    target({
      appliedAt: "2026-03-02T00:00:00Z",
      entries: [entry({ status: "accepted" })],
    }),
  );

  expect(summary.actionable).toBe(false);
  expect(summary.reviewable).toBe(false);
  expect(summary.headline).toBe("Applied to the draft");
});

test("the record's next step walks from decisions to published", () => {
  const open = entry({});
  const reviews = [target({ entries: [open, entry({ status: "accepted" })] })];

  const outstanding = recordNextStep(
    record({
      draftSnapshotId: 5,
      reviews,
      publishBlockers: ["The import review still has open changes."],
    }),
  );
  expect(outstanding.headline).toBe("1 decision outstanding");
  expect(outstanding.next).toBe("review");
  expect(outstanding.decided).toBe(1);

  const decided = recordNextStep(
    record({
      draftSnapshotId: 5,
      reviews: [target({ entries: [entry({ status: "accepted" })] })],
    }),
  );
  expect(decided.headline).toBe("Every change is decided");
  expect(decided.next).toBe("review");

  const ready = recordNextStep(
    record({
      draftSnapshotId: 5,
      reviews: [
        target({
          appliedAt: "2026-03-02T00:00:00Z",
          entries: [entry({ status: "accepted" })],
        }),
      ],
    }),
  );
  expect(ready.headline).toBe("Ready to publish");
  expect(ready.next).toBe("publish");

  const live = recordNextStep(record({ publishedSnapshotId: 5 }));
  expect(live.headline).toBe("Published");
  expect(live.next).toBe("none");
});

test("a blocking flag holds publication and names itself", () => {
  const step = recordNextStep(
    record({
      draftSnapshotId: 5,
      publishBlockers: ["A blocking flag on the import review is still open."],
      reviews: [
        target({
          entries: [
            entry({
              entryKind: "flag",
              isBlocking: true,
              issueCode: "INVALID",
            }),
          ],
        }),
      ],
    }),
  );

  expect(step.headline).toBe("1 flag blocking publication");
  expect(step.tone).toBe("warning");
});

test("decisions from a superseded import do not hold a record back", () => {
  // catalogue_publish_blockers reads the newest finished review and the one
  // behind the draft, so the interface counts the same two and no others.
  const step = recordNextStep(
    record({
      draftSnapshotId: 5,
      snapshots: [
        {
          id: 5,
          publicId: "sn_5",
          origin: "import",
          createdAt: "2026-03-02T00:00:00Z",
          sealedAt: null,
          basedOnSnapshotId: null,
          importTargetId: "target-1",
          contentHash: "abc",
        },
      ],
      reviews: [
        target({
          id: "target-1",
          appliedAt: "2026-03-02T00:00:00Z",
          entries: [entry({ status: "accepted" })],
        }),
        target({ id: "target-0", status: "failed", entries: [entry({})] }),
      ],
    }),
  );

  expect(step.headline).toBe("Ready to publish");
});

test("an id locator deep-links the ANU page and a selector does not", () => {
  const page = "https://programsandcourses.anu.edu.au/2026/course/COMP3600";

  expect(anuSourceLocation(page, "#learning-outcomes")).toEqual({
    label: "Learning outcomes",
    href: `${page}#learning-outcomes`,
  });
  // A class or attribute selector names markup, which tells a reviewer nothing.
  expect(anuSourceLocation(page, ".degree-summary")).toEqual({
    label: null,
    href: page,
  });
  expect(anuSourceLocation(page, 'meta[name="course-name"]')).toEqual({
    label: null,
    href: page,
  });
  // Structure evidence names a heading in the page's own words.
  expect(anuSourceLocation(page, "Admission Requirements")).toEqual({
    label: "Admission Requirements",
    href: page,
  });
  expect(anuSourceLocation(page, null)).toEqual({ label: null, href: page });
});
