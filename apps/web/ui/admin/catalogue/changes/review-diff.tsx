import { cn } from "@/lib/cn";
import { type DiffLine, diffLines } from "@/lib/catalogue/review-diff";
import {
  type RequirementRuleSlice,
  requirementSliceExpression,
} from "@/lib/catalogue/requirement-expression";
import type { CatalogueReviewUnitKind } from "@/lib/catalogue/review-units";
import {
  HIDDEN_COLUMNS,
  heading,
  isBlank,
  isRecord,
  plainText,
  ruleRows,
} from "./review-value";

// Unchanged runs longer than this fold to their first and last lines.
const CONTEXT = 2;

function asRows(value: unknown): unknown[] {
  if (isBlank(value)) return [];
  return Array.isArray(value) ? value : [value];
}

/** The columns either side fills, in first-seen order. */
function columnsOf(values: unknown[]) {
  const records = values.flatMap(asRows).filter(isRecord);
  return [...new Set(records.flatMap((record) => Object.keys(record)))].filter(
    (key) =>
      !HIDDEN_COLUMNS.has(key) &&
      records.some((record) => !isBlank(record[key])),
  );
}

function ruleLines(value: unknown) {
  if (isBlank(value)) return [];
  const slice = value as RequirementRuleSlice;
  const wording = slice.rule?.sourceText?.trim();
  const expression = requirementSliceExpression(slice);
  return [
    ...(wording ? [`“${wording}”`] : []),
    ...(expression
      ? ruleRows(expression).map(
          (row) =>
            `${"    ".repeat(row.depth)}${row.text}${
              row.confidence === null
                ? ""
                : `  (${Math.round(row.confidence * 100)}%)`
            }`,
        )
      : []),
  ];
}

/**
 * Each side of a change as lines to compare: text by line, a collection one
 * row per line with its columns in a fixed order, and a rule as its wording
 * then each step it asks for.
 */
function linesOf(
  value: unknown,
  unitKind: CatalogueReviewUnitKind,
  columns: string[],
) {
  if (isBlank(value)) return [];
  if (unitKind === "requirement_rule") return ruleLines(value);
  if (unitKind === "scalar") return plainText(value).split("\n");
  return asRows(value).map((row) =>
    isRecord(row)
      ? columns.map((column) => plainText(row[column]) || "—").join(" · ")
      : plainText(row),
  );
}

type Shown = DiffLine | { kind: "fold"; count: number };

function fold(lines: DiffLine[]): Shown[] {
  const shown: Shown[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index]!.kind !== "same") {
      shown.push(lines[index]!);
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end]!.kind === "same") end += 1;
    const run = lines.slice(index, end);
    const keepStart = index === 0 ? 0 : CONTEXT;
    const keepEnd = end === lines.length ? 0 : CONTEXT;
    if (run.length > keepStart + keepEnd + 1) {
      shown.push(...run.slice(0, keepStart));
      shown.push({ kind: "fold", count: run.length - keepStart - keepEnd });
      shown.push(...run.slice(run.length - keepEnd));
    } else {
      shown.push(...run);
    }
    index = end;
  }
  return shown;
}

const SIGN = { same: " ", removed: "−", added: "+" } as const;

/**
 * Two values as a unified diff, the way git shows a change: removed lines in
 * red, added lines in green, the words that changed within a line marked, and
 * long unchanged stretches folded.
 */
export function ReviewDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  unitKind,
}: {
  before: unknown;
  after: unknown;
  beforeLabel: string;
  afterLabel: string;
  unitKind: CatalogueReviewUnitKind;
}) {
  const columns = unitKind === "collection" ? columnsOf([before, after]) : [];
  const lines = diffLines(
    linesOf(before, unitKind, columns),
    linesOf(after, unitKind, columns),
  );
  const shown = fold(lines);
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-border">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          <span className="font-mono text-destructive">−</span> {beforeLabel}
          {isBlank(before) ? " (not set)" : ""}
        </span>
        <span>
          <span className="font-mono text-success">+</span> {afterLabel}
          {isBlank(after) ? " (not set)" : ""}
        </span>
        {columns.length ? (
          <span className="ml-auto">
            {columns.map((column) => heading(column)).join(" · ")}
          </span>
        ) : null}
      </figcaption>
      <div className="overflow-x-auto py-1 font-mono text-[13px] leading-6">
        {shown.length === 0 ? (
          <p className="px-3 text-muted-foreground">No difference</p>
        ) : (
          shown.map((line, index) =>
            line.kind === "fold" ? (
              <p
                key={index}
                className="bg-muted/30 px-3 text-xs leading-6 text-muted-foreground"
              >
                ⋯ {line.count} unchanged line{line.count === 1 ? "" : "s"}
              </p>
            ) : (
              <p
                key={index}
                className={cn(
                  "flex gap-3 px-3 whitespace-pre-wrap",
                  line.kind === "removed" && "bg-destructive/10",
                  line.kind === "added" && "bg-success/10",
                  line.kind === "same" && "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 select-none",
                    line.kind === "removed" && "text-destructive",
                    line.kind === "added" && "text-success",
                  )}
                >
                  {SIGN[line.kind]}
                </span>
                <span className="sr-only">
                  {line.kind === "removed"
                    ? "Removed: "
                    : line.kind === "added"
                      ? "Added: "
                      : ""}
                </span>
                <span className="min-w-0 break-words">
                  {line.parts
                    ? line.parts.map((part, at) =>
                        part.changed ? (
                          <mark
                            key={at}
                            className={cn(
                              "rounded-sm text-inherit",
                              line.kind === "removed"
                                ? "bg-destructive/30"
                                : "bg-success/30",
                            )}
                          >
                            {part.text}
                          </mark>
                        ) : (
                          part.text
                        ),
                      )
                    : line.text || " "}
                </span>
              </p>
            ),
          )
        )}
      </div>
    </figure>
  );
}
