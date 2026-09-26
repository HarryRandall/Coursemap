import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  type RequirementRuleSlice,
  requirementSliceExpression,
} from "@/lib/catalogue/requirement-expression";
import type { CatalogueReviewUnitKind } from "@/lib/catalogue/review-units";
import { JsonCode } from "@/ui/common/json-code";
import { EnrolmentSteps } from "@/ui/courses/enrolment-steps";
import { RequisiteDiagram } from "@/ui/courses/requisite-diagram";
import {
  groupSentence,
  requisiteSentence,
} from "@/ui/courses/requisite-wording";

/** The record under review, for drawing a rule the way its course page does. */
export type ReviewSubject = { code: string; academicYear: number };

// Bookkeeping every row carries that says nothing to a reviewer.
export const HIDDEN_COLUMNS = new Set(["position", "key", "id"]);
// Rules drawn as a chain into the course; the rest read better as a list.
const GRAPHED_RULES = new Set(["prerequisite", "corequisite"]);

export function isBlank(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function heading(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function plainText(value: unknown): string {
  if (isBlank(value)) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(plainText).join(", ");
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key, entry]) => !HIDDEN_COLUMNS.has(key) && !isBlank(entry))
      .map(([key, entry]) => `${heading(key)}: ${plainText(entry)}`)
      .join("; ");
  }
  return String(value);
}


/**
 * One side of a comparison. Scalars read as themselves, a collection reads as
 * a table, and a requirement rule leads with ANU's wording and can be viewed
 * as the course page's graph, as a table of its conditions or as stored.
 */
export function ReviewValue({
  label,
  value,
  unitKind,
  note,
  subject = null,
}: {
  label: string;
  value: unknown;
  unitKind: CatalogueReviewUnitKind;
  note?: string;
  subject?: ReviewSubject | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 min-w-0 text-sm break-words">
        {isBlank(value) ? (
          <span className="text-muted-foreground italic">Not set</span>
        ) : unitKind === "scalar" ? (
          <span className="whitespace-pre-wrap">{plainText(value)}</span>
        ) : unitKind === "requirement_rule" ? (
          <RequirementValue
            label={label}
            subject={subject}
            value={value as RequirementRuleSlice}
          />
        ) : (
          <CollectionTable label={label} value={value} />
        )}
      </div>
      {note ? (
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

function CollectionTable({ label, value }: { label: string; value: unknown }) {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.every((row) => !isRecord(row))) {
    return <p>{rows.map(plainText).join(", ")}</p>;
  }
  if (!Array.isArray(value) && isRecord(value)) {
    const entries = Object.entries(value).filter(
      ([key, entry]) => !HIDDEN_COLUMNS.has(key) && !isBlank(entry),
    );
    return (
      <Frame>
        <Table aria-label={label}>
          <TableBody>
            {entries.map(([key, entry]) => (
              <TableRow key={key}>
                <TableHead className="w-48 align-top">{heading(key)}</TableHead>
                <TableCell className="whitespace-pre-wrap">
                  {plainText(entry)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Frame>
    );
  }
  const records = rows.filter(isRecord);
  // Columns in first-seen order, leaving out any no row fills.
  const columns = [
    ...new Set(records.flatMap((record) => Object.keys(record))),
  ].filter(
    (key) =>
      !HIDDEN_COLUMNS.has(key) &&
      records.some((record) => !isBlank(record[key])),
  );
  return (
    <Frame>
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{heading(column)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell
                  key={column}
                  className="max-w-md align-top whitespace-pre-wrap"
                >
                  {plainText(record[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {children}
    </div>
  );
}

export function RequirementValue({
  label,
  subject,
  value,
}: {
  label: string;
  subject: ReviewSubject | null;
  value: RequirementRuleSlice;
}) {
  const wording = value.rule?.sourceText?.trim();
  const expression = requirementSliceExpression(value);
  const graphed =
    subject !== null &&
    expression !== null &&
    GRAPHED_RULES.has(value.rule?.key ?? "");
  const views = [
    ...(graphed ? ["graph"] : []),
    ...(expression ? ["table"] : []),
    "json",
  ];
  return (
    <div className="flex flex-col gap-3">
      {wording ? (
        <p className="whitespace-pre-wrap">{wording}</p>
      ) : (
        <p className="text-muted-foreground italic">No published wording</p>
      )}
      <Tabs defaultValue={views[0]} className="gap-2">
        <TabsList aria-label={`${label} view`}>
          {graphed ? <TabsTrigger value="graph">Graph</TabsTrigger> : null}
          {expression ? <TabsTrigger value="table">Table</TabsTrigger> : null}
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        {graphed && subject ? (
          <TabsContent
            value="graph"
            className="rounded-lg border border-border pt-4"
          >
            <RequisiteDiagram
              academicYear={subject.academicYear}
              availableCourseCodes={new Set(courseCodes(expression))}
              code={subject.code}
              expression={expression}
              hasPrerequisiteWording={Boolean(wording)}
              student={null}
              unlocks={[]}
              unlocksAreKnown={false}
            />
          </TabsContent>
        ) : null}
        {expression ? (
          <TabsContent value="table">
            {/* The list a student sees on the course page. */}
            <div className="overflow-hidden rounded-lg border border-border">
              <EnrolmentSteps
                academicYear={subject?.academicYear ?? new Date().getFullYear()}
                availableCourseCodes={new Set(courseCodes(expression))}
                expression={expression}
                student={null}
              />
            </div>
          </TabsContent>
        ) : null}
        <TabsContent value="json">
          <Frame>
            <JsonCode
              label={`${label} detail`}
              value={value}
              borderTop={false}
            />
          </Frame>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function courseCodes(expression: CourseRuleExpression | null): string[] {
  if (!expression) return [];
  if (expression.kind === "group") {
    return expression.conditions.flatMap(courseCodes);
  }
  return expression.kind === "course" ? [expression.code] : [];
}

type RequirementRow = {
  depth: number;
  text: string;
  detail: string;
  confidence: number | null;
};

function requirementRows(
  node: CourseRuleExpression,
  depth = 0,
): RequirementRow[] {
  if (node.kind === "group") {
    return [
      { depth, text: groupSentence(node), detail: "", confidence: null },
      ...node.conditions.flatMap((child) => requirementRows(child, depth + 1)),
    ];
  }
  return [
    {
      depth,
      text: requisiteSentence(node),
      detail: [
        node.hardness === "advisory" ? "Advisory" : null,
        node.reviewState === "review" ? "Marked for review" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      confidence: node.confidence,
    },
  ];
}

/** A rule's steps, dropping the all-of wrapper that says nothing the rows don't. */
export function ruleRows(expression: CourseRuleExpression) {
  return expression.kind === "group" && expression.operator === "all_of"
    ? expression.conditions.flatMap((child) => requirementRows(child))
    : requirementRows(expression);
}
