import type {
  CatalogueRecord,
  ReviewEntry,
  ReviewTarget,
} from "@/lib/coursemap/admin-catalogue-record";
import { FIELD_LABELS, humaniseKey } from "@/lib/coursemap/catalogue-kinds";

/**
 * What a reviewer has to know about a record and one import review, worked out
 * away from the components that draw it. The rules here mirror the
 * catalogue_publish_blockers function, so the interface never promises a
 * publication the database will refuse.
 */

/**
 * Flag codes come from the extraction review items, uppercased. They are a
 * database vocabulary, so they are named for the reader rather than shown raw.
 */
const ISSUE_LABELS: Record<string, string> = {
  CONFLICT: "Model disagreed with the parser",
  EVIDENCE_MISSING: "No supporting excerpt",
  INVALID: "Failed the extraction contract",
};

export function issueLabel(code: string | null) {
  if (!code) return "Flagged by the parser";
  return ISSUE_LABELS[code] ?? humaniseKey(code);
}

/**
 * A change names a full field path, but a flag names only the leaf key the
 * extractor used, such as "eftsl" or "requisites.prerequisiteText". Matching
 * the label map by suffix keeps a flag readable without a second label table;
 * where two paths share a leaf they already share a name.
 */
export function flagFieldLabel(fieldPath: string) {
  const exact = FIELD_LABELS[fieldPath];
  if (exact) return exact;
  const suffix = `.${fieldPath}`;
  for (const [path, label] of Object.entries(FIELD_LABELS)) {
    if (path.endsWith(suffix)) return label;
  }
  return humaniseKey(fieldPath.split(".").pop() ?? fieldPath);
}

export type FlagGroup = {
  key: string;
  label: string;
  entries: ReviewEntry[];
  open: ReviewEntry[];
};

/**
 * Blocking flags are decisions and stay separate and whole: each one holds
 * publication and needs a note. The rest are diagnostics of the same few
 * kinds, so they collapse into one row per kind rather than repeating an
 * identical card six times.
 */
export function groupFlags(flags: ReviewEntry[]) {
  const blocking = flags.filter((flag) => flag.isBlocking);
  const groups = new Map<string, FlagGroup>();
  for (const flag of flags) {
    if (flag.isBlocking) continue;
    const key = flag.issueCode ?? "other";
    const group = groups.get(key) ?? {
      key,
      label: issueLabel(flag.issueCode),
      entries: [],
      open: [],
    };
    group.entries.push(flag);
    if (flag.status === "open") group.open.push(flag);
    groups.set(key, group);
  }
  return { blocking, groups: [...groups.values()] };
}

export type ChangeGroup = {
  key: string;
  label: string;
  /** Said once above the rows it applies to, rather than on every row. */
  note: string | null;
  entries: ReviewEntry[];
  open: ReviewEntry[];
};

const CHANGE_GROUPS: Array<{
  key: string;
  label: string;
  note: string | null;
  match: (fieldPath: string) => boolean;
}> = [
  {
    key: "details",
    label: "Details",
    note: null,
    match: (fieldPath) => fieldPath.includes(".details."),
  },
  {
    key: "requirements",
    label: "Requirements",
    note: "One decision per requisite rule.",
    match: (fieldPath) => fieldPath.startsWith("requirements."),
  },
  {
    key: "lists",
    label: "Lists",
    // The pipeline records a whole collection as one row, so say where that
    // bites instead of implying a field-by-field decision the table cannot give.
    note: "Each row is a whole list, accepted or rejected together. Compare shows the entries that differ.",
    match: () => true,
  },
];

/**
 * Thirty rows of equal weight are a wall. Grouping them by the part of the
 * record they belong to gives the table rhythm and lets a reviewer clear one
 * kind of change at a time.
 */
export function groupChanges(changes: ReviewEntry[]): ChangeGroup[] {
  const entries = new Map<string, ReviewEntry[]>();
  for (const change of changes) {
    const group = CHANGE_GROUPS.find((candidate) =>
      candidate.match(change.fieldPath),
    );
    if (!group) continue;
    entries.set(group.key, [...(entries.get(group.key) ?? []), change]);
  }
  return CHANGE_GROUPS.flatMap((group) => {
    const rows = entries.get(group.key);
    if (!rows?.length) return [];
    return [
      {
        key: group.key,
        label: group.label,
        note: group.note,
        entries: rows,
        open: rows.filter((entry) => entry.status === "open"),
      },
    ];
  });
}

export type ReviewSummary = {
  changes: ReviewEntry[];
  flags: ReviewEntry[];
  openChanges: ReviewEntry[];
  openBlockingFlags: ReviewEntry[];
  openFlags: ReviewEntry[];
  decided: number;
  applied: boolean;
  /** Accept and Reject only mean something while a comparison is unresolved. */
  reviewable: boolean;
  /** Whether this run still asks the reviewer for anything. */
  actionable: boolean;
  headline: string;
  detail: string;
};

export function reviewSummary(review: ReviewTarget): ReviewSummary {
  const changes = review.entries.filter(
    (entry) => entry.entryKind === "change",
  );
  const flags = review.entries.filter((entry) => entry.entryKind === "flag");
  const openChanges = changes.filter((entry) => entry.status === "open");
  const openFlags = flags.filter((entry) => entry.status === "open");
  const openBlockingFlags = openFlags.filter((entry) => entry.isBlocking);
  const applied = review.appliedAt !== null;
  const reviewable =
    review.status === "ready" && !applied && review.baselineVersionId !== null;
  const actionable =
    reviewable || openChanges.length > 0 || openFlags.length > 0;

  const headline =
    openChanges.length > 0
      ? `${openChanges.length} of ${changes.length} changes still to decide`
      : openBlockingFlags.length > 0
        ? `${openBlockingFlags.length} flag${openBlockingFlags.length === 1 ? "" : "s"} blocking publication`
        : reviewable
          ? "Every change is decided"
          : applied
            ? "Applied to the draft"
            : changes.length === 0
              ? "Nothing changed"
              : "Decided";

  const detail =
    openChanges.length > 0
      ? "Accept or reject each one, then apply the review so the draft carries the result."
      : openBlockingFlags.length > 0
        ? "Acknowledge each blocking flag with a note before the draft can be published."
        : reviewable
          ? "Apply the review to move the accepted changes into the draft."
          : openFlags.length > 0
            ? `${openFlags.length} flag${openFlags.length === 1 ? " is" : "s are"} noted but publication is not held back.`
            : "Nothing here is waiting on you.";

  return {
    changes,
    flags,
    openChanges,
    openBlockingFlags,
    openFlags,
    decided: changes.length - openChanges.length,
    applied,
    reviewable,
    actionable,
    headline,
    detail,
  };
}

/**
 * The reviews the publication gate actually reads: the newest finished one and
 * whichever produced the current draft. Counting every review instead would
 * report decisions from a superseded import that no longer hold anything back.
 */
function gatingReviews(record: CatalogueRecord) {
  const latest = record.reviews.find(
    (review) => review.status === "ready" || review.status === "unchanged",
  );
  const draftTargetId =
    record.versions.find((version) => version.id === record.currentVersionId)
      ?.importTargetId ?? null;
  const draftReview = draftTargetId
    ? record.reviews.find((review) => review.id === draftTargetId)
    : undefined;
  const ids = new Set(
    [latest?.id, draftReview?.id].filter((id): id is string => Boolean(id)),
  );
  return record.reviews.filter((review) => ids.has(review.id));
}

export type RecordStep = {
  tone: "success" | "warning" | "info" | "neutral";
  headline: string;
  detail: string;
  /** The one control that moves the record forward from here. */
  next: "publish" | "review" | "none";
  /**
   * Only the reasons the headline does not already give. The named states
   * above explain themselves, so listing the database's wording again beside
   * them would say the same thing twice.
   */
  blockers: string[];
  decisions: number;
  decided: number;
};

/**
 * The record's verdict: what state it is in, why it is not published, and the
 * single thing to do next. The reviewer should answer "can I publish this, and
 * if not why" from this alone.
 */
export function recordNextStep(record: CatalogueRecord): RecordStep {
  const gating = gatingReviews(record);
  const entries = gating.flatMap((review) => review.entries);
  const changes = entries.filter((entry) => entry.entryKind === "change");
  const openChanges = changes.filter((entry) => entry.status === "open");
  const openBlockingFlags = entries.filter(
    (entry) =>
      entry.entryKind === "flag" && entry.isBlocking && entry.status === "open",
  );
  const unapplied = gating.find(
    (review) =>
      review.status === "ready" &&
      review.appliedAt === null &&
      review.baselineVersionId !== null,
  );
  const hasDraft = record.currentVersionId !== null;
  const published = record.publishedVersionId !== null;
  // Without a draft there is nothing to publish, which is the ordinary state of
  // a finished record rather than a problem, so it is not reported as one.
  const blockers = hasDraft ? record.publishBlockers : [];
  const base = {
    blockers: [] as string[],
    decisions: changes.length,
    decided: changes.length - openChanges.length,
  };

  if (record.archivedAt)
    return {
      ...base,
      tone: "neutral",
      headline: "Archived",
      detail: "An archived record cannot be published until it is restored.",
      next: "none",
    };

  if (!hasDraft && !published)
    return {
      ...base,
      tone: "neutral",
      headline: "Not imported yet",
      detail:
        "Run an import from the directory to create a draft to review and publish.",
      next: "none",
    };

  if (openChanges.length > 0)
    return {
      ...base,
      tone: "warning",
      headline: `${openChanges.length} decision${openChanges.length === 1 ? "" : "s"} outstanding`,
      detail:
        "The draft cannot be published while the import review has changes nobody has accepted or rejected.",
      next: "review",
    };

  if (openBlockingFlags.length > 0)
    return {
      ...base,
      tone: "warning",
      headline: `${openBlockingFlags.length} flag${openBlockingFlags.length === 1 ? "" : "s"} blocking publication`,
      detail:
        "Acknowledge each one with a note saying why publication may proceed.",
      next: "review",
    };

  if (unapplied)
    return {
      ...base,
      tone: "info",
      headline: "Every change is decided",
      detail:
        "Apply the review so the accepted changes become the draft, then publish it.",
      next: "review",
    };

  if (blockers.length > 0)
    return {
      ...base,
      blockers: blockers.length > 1 ? blockers : [],
      tone: "warning",
      headline:
        blockers.length === 1
          ? "The draft cannot be published yet"
          : `${blockers.length} things hold the draft back`,
      detail: blockers.length === 1 ? (blockers[0] ?? "") : "",
      next: "review",
    };

  if (!hasDraft)
    return {
      ...base,
      tone: "success",
      headline: "Published",
      detail: `Students see this record for ${record.academicYear}. Nothing is waiting to replace it.`,
      next: "none",
    };

  return {
    ...base,
    tone: "success",
    headline: "Ready to publish",
    detail: published
      ? `Publishing replaces what students see for ${record.academicYear}.`
      : `Publishing makes this record visible to students for ${record.academicYear}.`,
    next: "publish",
  };
}
