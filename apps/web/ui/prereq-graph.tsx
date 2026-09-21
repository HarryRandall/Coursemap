"use client";

import Link from "next/link";
import {
  CalendarDays,
  Check,
  CircleAlert,
  CircleDashed,
  GaugeCircle,
  LockKeyhole,
} from "lucide-react";
import { Fragment, useId, useMemo } from "react";
import { Badge } from "@coursemap/ui/components/badge";
import { Hint } from "@/ui/common/hint";
import { cn } from "@/lib/cn";
import type {
  CoursePrerequisiteEdge,
  CourseRuleExpression,
} from "@/lib/coursemap/course-types";
import {
  buildRequisiteGraph,
  requisiteConditionNode,
  type RequisiteGraphNode,
} from "@/lib/coursemap/requisite-tree";
import { conditionSummary } from "@/ui/requirements/requirement-presentation";

const COLUMN_WIDTH = 168;
/**
 * A junction is a short pill ("Choose one", "All of these"), so a column that
 * holds nothing else is narrower. At a uniform width the junction that makes
 * the AND explicit added a full column and pushed the graph past its card.
 */
const JUNCTION_WIDTH = 116;
const COLUMN_GAP = 36;
const ROW_GAP = 14;
const CHOICE_HEIGHT = 34;
const REQUIREMENT_HEIGHT = 68;
const EMPTY_HEIGHT = 46;
const ARROW_INSET = 3;

type CourseStatus = "completed" | "enrolled" | "planned";

/** A node, or a column's empty state, with somewhere to sit on the canvas. */
type Placed = {
  column: number;
  height: number;
  id: string;
  node: RequisiteGraphNode | null;
  top: number;
};

function courseHeight(showStudentState: boolean) {
  return showStudentState ? 64 : 46;
}

function nodeHeight(node: RequisiteGraphNode, showStudentState: boolean) {
  if (node.kind === "choice") return CHOICE_HEIGHT;
  if (node.kind === "requirement") return REQUIREMENT_HEIGHT;
  if (node.kind === "current") return courseHeight(false);
  return courseHeight(showStudentState);
}

const STATUS_LABEL: Record<CourseStatus, string> = {
  completed: "Completed",
  enrolled: "Enrolled",
  planned: "Planned",
};

/**
 * The same words and icons the requirement kit puts on a course row, so a
 * course means the same thing in the graph and in the card underneath it.
 */
function CourseStatusBadge({ status }: { status: CourseStatus | null }) {
  return (
    <Badge
      variant={
        status === "completed"
          ? "success-light"
          : status
            ? "primary-light"
            : "secondary"
      }
    >
      {status === "completed" ? (
        <Check className="size-3" aria-hidden="true" />
      ) : status ? (
        <CalendarDays className="size-3" aria-hidden="true" />
      ) : (
        <CircleDashed className="size-3" aria-hidden="true" />
      )}
      {status ? STATUS_LABEL[status] : "Not planned"}
    </Badge>
  );
}

function choiceLabel(node: Extract<RequisiteGraphNode, { kind: "choice" }>) {
  if (node.operator === "all_of") return "All of these";
  if (node.operator === "any_of") return "Choose one";
  return `Choose at least ${node.minimumCount ?? 1}`;
}

/**
 * The prerequisite rule as a left-to-right dependency graph, with a node for
 * every condition the rule states. Alternatives get a group node so an OR
 * cannot be mistaken for a list of separate requirements, and a unit rule is
 * a node like any other rather than being dropped for naming no single course.
 *
 * Drawn with layout and SVG rather than the React Flow canvas the reviewer's
 * editor uses: every node here is a real link or a real piece of text in
 * reading order, which a student on a phone or a screen reader needs and a
 * pannable canvas takes away.
 */
export function PrereqGraph({
  academicYear,
  availableCourseCodes,
  code,
  expression,
  hasPrerequisiteWording,
  prerequisiteEdges,
  showStudentState,
  statusByCode,
  unlocksAreKnown,
}: {
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
  code: string;
  expression: CourseRuleExpression | null;
  hasPrerequisiteWording: boolean;
  prerequisiteEdges: readonly CoursePrerequisiteEdge[];
  showStudentState: boolean;
  statusByCode: ReadonlyMap<string, CourseStatus>;
  unlocksAreKnown: boolean;
}) {
  const markerId = useId();
  const graph = useMemo(
    () =>
      buildRequisiteGraph({
        availableCourseCodes,
        code,
        expression,
        prerequisiteEdges,
      }),
    [availableCourseCodes, code, expression, prerequisiteEdges],
  );

  // With nothing on either side there is no chain to draw. Three empty boxes
  // with no edges between them read as a diagram that failed to render, and
  // drawing arrows to placeholders would invent relationships, so say it.
  if (graph.nodes.every((node) => node.kind === "current")) {
    return (
      <p
        className="px-5 pb-5 text-center text-sm text-muted-foreground"
        data-testid="prereq-graph"
      >
        {unlocksAreKnown
          ? `${code} has no prerequisites, and no published course lists it as one.`
          : `${code} has no prerequisites. Which courses it leads to is not known until it is published.`}
      </p>
    );
  }

  const columnCount = graph.maximumDepth + 2;
  const currentColumn = graph.maximumDepth;
  const columnOf = (node: RequisiteGraphNode) =>
    node.kind === "unlocked"
      ? columnCount - 1
      : graph.maximumDepth - node.depth;

  const placed: Placed[] = [];
  const byColumn = new Map<number, Placed[]>();
  const push = (entry: Placed) => {
    placed.push(entry);
    byColumn.set(entry.column, [...(byColumn.get(entry.column) ?? []), entry]);
  };
  for (const node of graph.nodes) {
    push({
      column: columnOf(node),
      height: nodeHeight(node, showStudentState),
      id: node.id,
      node,
      top: 0,
    });
  }
  if ((byColumn.get(currentColumn - 1) ?? []).length === 0) {
    push({
      column: currentColumn - 1,
      height: EMPTY_HEIGHT,
      id: "empty-requires",
      node: null,
      top: 0,
    });
  }
  if ((byColumn.get(columnCount - 1) ?? []).length === 0) {
    push({
      column: columnCount - 1,
      height: EMPTY_HEIGHT,
      id: "empty-unlocks",
      node: null,
      top: 0,
    });
  }

  const columnHeights = new Map<number, number>();
  for (const [column, entries] of byColumn) {
    columnHeights.set(
      column,
      entries.reduce((total, entry) => total + entry.height, 0) +
        ROW_GAP * Math.max(0, entries.length - 1),
    );
  }
  const height = Math.max(EMPTY_HEIGHT, ...columnHeights.values());
  for (const [column, entries] of byColumn) {
    let offset = (height - (columnHeights.get(column) ?? 0)) / 2;
    for (const entry of entries) {
      entry.top = offset;
      offset += entry.height + ROW_GAP;
    }
  }

  const geometry = new Map(placed.map((entry) => [entry.id, entry]));
  const columnWidths = Array.from({ length: columnCount }, (_, column) => {
    const entries = byColumn.get(column) ?? [];
    return entries.length > 0 &&
      entries.every((entry) => entry.node?.kind === "choice")
      ? JUNCTION_WIDTH
      : COLUMN_WIDTH;
  });
  const leftOf = (column: number) =>
    columnWidths
      .slice(0, column)
      .reduce((total, columnWidth) => total + columnWidth + COLUMN_GAP, 0);
  const widthOf = (column: number) => columnWidths[column] ?? COLUMN_WIDTH;
  const width = leftOf(columnCount - 1) + widthOf(columnCount - 1);

  return (
    <div className="overflow-x-auto px-5 pb-5" data-testid="prereq-graph">
      {/* Centred when it fits; mx-auto has no effect once the diagram is wider
          than the card, so a wide graph still scrolls from its left edge. */}
      <div className="mx-auto" style={{ width }}>
        <div
          className="grid pb-2 text-center text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase"
          style={{
            columnGap: COLUMN_GAP,
            gridTemplateColumns: columnWidths
              .map((columnWidth) => `${columnWidth}px`)
              .join(" "),
          }}
        >
          <p style={{ gridColumn: `span ${currentColumn}` }}>Requires</p>
          <p>This course</p>
          <p>Unlocks</p>
        </div>

        <div className="relative" style={{ height }}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute top-0 left-0 overflow-visible"
            aria-hidden="true"
          >
            {/* Without heads the edges gave no direction, so a reader could not
                tell what led to what. One marker per state, because a marker
                cannot inherit its path's colour everywhere. */}
            <defs>
              {(["idle", "met"] as const).map((state) => (
                <marker
                  key={state}
                  id={`${markerId}-${state}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    className={
                      state === "met"
                        ? "fill-success"
                        : "fill-muted-foreground/60"
                    }
                  />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge) => {
              const from = geometry.get(edge.from);
              const to = geometry.get(edge.to);
              if (!from || !to) return null;
              const x1 = leftOf(from.column) + widthOf(from.column);
              // Stop short of the node so the head sits in the gap rather than
              // on the node's border.
              const x2 = leftOf(to.column) - ARROW_INSET;
              const y1 = from.top + from.height / 2;
              const y2 = to.top + to.height / 2;
              const mid = (x1 + x2) / 2;
              const met =
                from.node?.kind === "course" &&
                statusByCode.get(from.node.code) === "completed";
              return (
                <path
                  key={`${edge.from}:${edge.to}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  strokeDasharray={edge.alternative ? "5 4" : undefined}
                  className={
                    met ? "stroke-success" : "stroke-muted-foreground/50"
                  }
                  strokeWidth={1.75}
                  markerEnd={`url(#${markerId}-${met ? "met" : "idle"})`}
                />
              );
            })}
          </svg>

          {placed.map((entry) => {
            const style = {
              height: entry.height,
              left: leftOf(entry.column),
              top: entry.top,
              width: widthOf(entry.column),
            };
            if (!entry.node) {
              const unlocks = entry.id === "empty-unlocks";
              const label = unlocks
                ? unlocksAreKnown
                  ? "No published course lists this one"
                  : "Not known yet"
                : hasPrerequisiteWording
                  ? "See prerequisite requirements"
                  : "No prerequisite listed";
              const box = (
                <p
                  style={style}
                  className="absolute flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-center text-[11px] font-medium text-muted-foreground"
                >
                  {label}
                </p>
              );
              if (!unlocks || unlocksAreKnown) {
                return <Fragment key={entry.id}>{box}</Fragment>;
              }
              return (
                <Hint
                  key={entry.id}
                  label="This course is not published for this year, so the courses it unlocks have not been looked up."
                >
                  {box}
                </Hint>
              );
            }
            return (
              <GraphNode
                academicYear={academicYear}
                key={entry.id}
                node={entry.node}
                showStudentState={showStudentState}
                statusByCode={statusByCode}
                style={style}
              />
            );
          })}
        </div>

        {graph.incompatibleCodes.length > 0 ? (
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <CircleAlert
              className="mt-px size-3.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>
              Not a prerequisite: this course cannot be counted with{" "}
              {graph.incompatibleCodes.join(", ")}.
            </span>
          </p>
        ) : null}
        {graph.source === "references" ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Drawn from the course codes found in the prerequisite wording. The
            rule has not been reviewed, so any choice between them is not shown.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GraphNode({
  academicYear,
  node,
  showStudentState,
  statusByCode,
  style,
}: {
  academicYear: number;
  node: RequisiteGraphNode;
  showStudentState: boolean;
  statusByCode: ReadonlyMap<string, CourseStatus>;
  style: { height: number; left: number; top: number; width: number };
}) {
  if (node.kind === "choice") {
    return (
      <p
        style={style}
        className="absolute flex items-center justify-center rounded-full border border-primary/30 bg-primary/5 px-3 text-center text-xs font-semibold text-primary"
      >
        {choiceLabel(node)}
      </p>
    );
  }

  if (node.kind === "requirement") {
    const condition = requisiteConditionNode(node.condition);
    const summary = conditionSummary(condition) || node.condition.sourceText;
    return (
      <div
        style={style}
        className="absolute flex items-center gap-2 rounded-lg border border-border bg-card px-3"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <GaugeCircle className="size-4" aria-hidden="true" />
        </span>
        {/* One line that leads with the figure: a category heading over a
            detail line repeated itself and left "24 units" in the faintest
            text on the node. */}
        <span className="line-clamp-3 min-w-0 text-xs leading-snug font-medium">
          {summary}
        </span>
      </div>
    );
  }

  if (node.kind === "current") {
    return (
      <span
        style={style}
        aria-current="page"
        className="absolute flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 font-mono text-[13px] font-semibold text-white shadow-sm"
      >
        {node.code}
      </span>
    );
  }

  const status = statusByCode.get(node.code) ?? null;
  const body = (
    <>
      <span className="font-mono text-[13px] font-semibold">{node.code}</span>
      {node.kind === "course" &&
      node.condition?.kind === "course" &&
      node.condition.requirementMode === "completed_or_concurrent" ? (
        <span className="text-[10px] leading-tight text-muted-foreground">
          Completed or taken at the same time
        </span>
      ) : null}
      {showStudentState && node.isAvailable ? (
        <CourseStatusBadge status={status} />
      ) : null}
    </>
  );
  const className = cn(
    "absolute flex flex-col items-center justify-center gap-1 rounded-lg px-2 text-center transition-colors motion-reduce:transition-none",
    !node.isAvailable
      ? "border border-border bg-muted/40 text-muted-foreground"
      : status === "completed"
        ? "border border-success/30 bg-success/5 hover:bg-success/10"
        : status
          ? "border border-primary/30 bg-primary/5 hover:bg-primary/10"
          : "border border-border bg-card hover:border-foreground/20 hover:bg-muted/40",
  );

  if (!node.isAvailable) {
    return (
      <Hint label={`${node.code}: course details unavailable`}>
        <span style={style} className={className}>
          <span className="flex items-center gap-1">
            <LockKeyhole className="size-3" aria-hidden="true" />
            <span className="font-mono text-[13px] font-semibold">
              {node.code}
            </span>
          </span>
          <span className="text-[10px] leading-tight">Not available</span>
        </span>
      </Hint>
    );
  }

  return (
    <Link
      href={`/courses/${node.code}?year=${academicYear}`}
      prefetch={false}
      style={style}
      className={cn(
        className,
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  );
}
