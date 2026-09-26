import Link from "next/link";
import {
  ArrowUpRight,
  CalendarRange,
  Check,
  CircleAlert,
  GaugeCircle,
  GraduationCap,
  Info,
  KeyRound,
  LockKeyhole,
  TrendingUp,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";
import type { CourseRuleCondition } from "@/lib/coursemap/requisite-tree";
import {
  groupLabel,
  requisiteExplorerLink,
  requisiteNoun,
  splitRequisiteRule,
} from "@/ui/courses/requisite-wording";

/*
 * Drawn from fixed geometry rather than measured layout, so every line meets
 * the centre of the box it joins and there is one arrowhead per box.
 */
const CARD = 44;
const CARD_GAP = 8;
const HEADER = 24;
const JOINER = 26;
const PAD = 8;
const BORDER = 2;
const ENTRY_GAP = 16;
const COURSE_H = 48;
const REQUIRES_W = 220;
const MERGE_GAP = 40;
const COURSE_W = 160;
const UNLOCK_GAP = 64;
const UNLOCK_W = 150;
const EMPTY_H = 46;

type Group = Extract<CourseRuleExpression, { kind: "group" }>;

function heightOf(node: CourseRuleExpression): number {
  if (node.kind !== "group") return CARD;
  return (
    BORDER +
    PAD * 2 +
    HEADER +
    node.conditions.reduce((total, child) => total + heightOf(child), 0) +
    (node.conditions.length - 1) * JOINER
  );
}

const courseHref = (year: number, code: string) =>
  `/courses/${year}/${code.toLowerCase()}`;

function KindIcon({ kind }: { kind: CourseRuleCondition["kind"] }) {
  const Icon =
    kind === "wam" || kind === "gpa"
      ? TrendingUp
      : kind === "year_standing"
        ? CalendarRange
        : kind === "structure" || kind === "structure_set"
          ? GraduationCap
          : kind === "other"
            ? Info
            : GaugeCircle;
  return <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />;
}

function Met() {
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-full bg-success text-white">
      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      <span className="sr-only">Done</span>
    </span>
  );
}

function CourseCard({
  code,
  academicYear,
  available,
  met,
  style,
  className,
}: {
  code: string;
  academicYear: number;
  available: boolean;
  met: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const box = cn(
    "flex h-11 items-center justify-between gap-2 rounded-lg border px-3",
    className,
  );
  if (!available) {
    return (
      <span
        style={style}
        title={`${code}: course details unavailable`}
        className={cn(box, "border-border bg-muted/40 text-muted-foreground")}
      >
        <span className="font-mono text-[13px] font-semibold">{code}</span>
        <LockKeyhole className="size-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <Link
      href={courseHref(academicYear, code)}
      prefetch={false}
      style={style}
      className={cn(
        box,
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
        met
          ? "border-success/40 bg-success/5 hover:bg-success/10"
          : "border-border bg-card hover:border-primary/50",
      )}
    >
      <span className="font-mono text-[13px] font-semibold">{code}</span>
      {met ? (
        <Met />
      ) : (
        <ArrowUpRight
          className="size-3.5 text-muted-foreground/70"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

function Leaf({
  node,
  academicYear,
  availableCourseCodes,
  student,
  style,
  className,
}: {
  node: CourseRuleCondition;
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
  student: StudentRecord | null;
  style?: CSSProperties;
  className?: string;
}) {
  const met = student ? evaluateRule(node, student).status === "met" : false;
  if (node.kind === "course") {
    return (
      <CourseCard
        code={node.code}
        academicYear={academicYear}
        available={availableCourseCodes.has(node.code)}
        met={met}
        style={style}
        className={className}
      />
    );
  }
  const link = requisiteExplorerLink(node, academicYear);
  const box = cn(
    "flex h-11 items-center gap-2 rounded-lg border px-3",
    met ? "border-success/40 bg-success/5" : "border-border bg-card",
    className,
  );
  const content = (
    <>
      <KindIcon kind={node.kind} />
      <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug font-medium">
        {requisiteNoun(node)}
      </span>
      {met ? (
        <Met />
      ) : link ? (
        <ArrowUpRight
          className="size-3.5 shrink-0 text-muted-foreground/70"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
  // A unit rule opens the courses that count towards it.
  return link ? (
    <Link
      href={link.href}
      prefetch={false}
      title={link.label}
      aria-label={`${requisiteNoun(node)}. ${link.label}`}
      style={style}
      className={cn(
        box,
        "transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
      )}
    >
      {content}
    </Link>
  ) : (
    <div style={style} className={box}>
      {content}
    </div>
  );
}

function Joiner({ word }: { word: "and" | "or" }) {
  return (
    <div
      aria-hidden="true"
      style={{ height: JOINER }}
      className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase"
    >
      <span className="h-px flex-1 bg-border" />
      <span
        className={cn(
          "rounded-full px-2 py-0.5",
          word === "or"
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {word}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GroupBox({
  group,
  style,
  className,
  ...shared
}: {
  group: Group;
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
  student: StudentRecord | null;
  style?: CSSProperties;
  className?: string;
}) {
  const choice = group.operator !== "all_of";
  return (
    <div
      role="group"
      aria-label={groupLabel(group)}
      style={{ ...style, height: heightOf(group), padding: PAD }}
      className={cn(
        "rounded-xl border",
        choice
          ? "border-dashed border-primary/50 bg-primary/[0.04]"
          : "border-border bg-muted/30",
        className,
      )}
    >
      <p
        style={{ height: HEADER }}
        className={cn(
          "px-1 text-[10px] font-bold tracking-wider uppercase",
          choice ? "text-primary" : "text-muted-foreground",
        )}
      >
        {groupLabel(group)}
      </p>
      {group.conditions.map((child, index) => (
        <div key={index}>
          {index > 0 ? <Joiner word={choice ? "or" : "and"} /> : null}
          {child.kind === "group" ? (
            <GroupBox group={child} {...shared} />
          ) : (
            <Leaf node={child} {...shared} />
          )}
        </div>
      ))}
    </div>
  );
}

function Head({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M ${x - 8} ${y - 4.5} L ${x} ${y} L ${x - 8} ${y + 4.5} z`}
      className="fill-muted-foreground/80"
    />
  );
}

function Line({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      className="stroke-muted-foreground/55"
      strokeWidth={1.5}
    />
  );
}

function Placeholder({
  label,
  style,
}: {
  label: string;
  style: CSSProperties;
}) {
  return (
    <p
      style={style}
      className="absolute flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-center text-[11px] font-medium text-muted-foreground"
    >
      {label}
    </p>
  );
}

/**
 * What a course needs, the course, and what it opens up: three columns and
 * nothing further upstream, since each linked course carries its own diagram.
 * Every requirement is its own box and their lines meet at one point before a
 * single arrow, so the rule's AND is drawn rather than implied.
 */
export function RequisiteDiagram({
  academicYear,
  availableCourseCodes,
  code,
  expression,
  hasPrerequisiteWording,
  student,
  unlocks,
  unlocksAreKnown,
}: {
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
  code: string;
  expression: CourseRuleExpression | null;
  hasPrerequisiteWording: boolean;
  student: StudentRecord | null;
  unlocks: readonly { code: string; isAvailable: boolean }[];
  unlocksAreKnown: boolean;
}) {
  const { requirements, permissions, incompatible } =
    splitRequisiteRule(expression);

  if (
    requirements.length === 0 &&
    unlocks.length === 0 &&
    !permissions.length
  ) {
    return (
      <p
        className="px-5 pb-5 text-center text-sm text-muted-foreground"
        data-testid="requisite-diagram"
      >
        {hasPrerequisiteWording
          ? `The prerequisites for ${code} have not been read into a chain yet. They are listed below as ANU publishes them.`
          : unlocksAreKnown
            ? `${code} has no prerequisites, and no published course lists it as one.`
            : `${code} has no prerequisites. Which courses it leads to is not known until it is published.`}
      </p>
    );
  }

  const shared = { academicYear, availableCourseCodes, student };
  const heights = requirements.map(heightOf);
  const requiresTotal = requirements.length
    ? heights.reduce((total, height) => total + height, 0) +
      (requirements.length - 1) * ENTRY_GAP
    : EMPTY_H;
  const unlockTotal = unlocks.length
    ? unlocks.length * CARD + (unlocks.length - 1) * CARD_GAP
    : EMPTY_H;
  // Room below the course for the permission badge.
  const courseTotal = COURSE_H + (permissions.length ? 2 * 40 : 0);
  const height = Math.max(requiresTotal, unlockTotal, courseTotal);
  const mid = height / 2;

  const firstTop = (height - requiresTotal) / 2;
  const placed = requirements.map((node, index) => {
    const top =
      firstTop +
      heights
        .slice(0, index)
        .reduce((total, entryHeight) => total + entryHeight + ENTRY_GAP, 0);
    return { node, top, anchor: top + heights[index]! / 2 };
  });

  const merges = placed.length > 1;
  const mergeX = REQUIRES_W + MERGE_GAP;
  const courseX = mergeX + (merges ? 44 : 0);
  const unlockX = courseX + COURSE_W + UNLOCK_GAP;
  // With nothing known to follow, the column is left out rather than filled
  // with a placeholder, and the diagram closes on the course.
  const width = unlocks.length ? unlockX + UNLOCK_W : courseX + COURSE_W;
  const spineX = courseX + COURSE_W + UNLOCK_GAP / 2;
  const unlockTop = mid - unlockTotal / 2;
  const unlockCentre = (index: number) =>
    unlockTop + index * (CARD + CARD_GAP) + CARD / 2;

  return (
    <div className="overflow-x-auto px-5 pb-6" data-testid="requisite-diagram">
      {/* Centred when it fits; a wider diagram scrolls from its left edge. */}
      <div className="mx-auto" style={{ width }}>
        <div className="relative h-6 text-center text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
          <p className="absolute" style={{ left: 0, width: REQUIRES_W }}>
            {merges ? "Requires all of" : "Requires"}
          </p>
          <p className="absolute" style={{ left: courseX, width: COURSE_W }}>
            This course
          </p>
          {unlocks.length ? (
            <p className="absolute" style={{ left: unlockX, width: UNLOCK_W }}>
              Unlocks
            </p>
          ) : null}
        </div>
        <div className="relative" style={{ height }}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            {merges ? (
              <>
                {placed.map((entry) => {
                  const bend = REQUIRES_W + MERGE_GAP / 2;
                  return (
                    <Line
                      key={entry.anchor}
                      d={`M ${REQUIRES_W} ${entry.anchor} C ${bend} ${entry.anchor}, ${bend} ${mid}, ${mergeX} ${mid}`}
                    />
                  );
                })}
                <circle
                  cx={mergeX}
                  cy={mid}
                  r={3.5}
                  className="fill-muted-foreground"
                />
                <Line d={`M ${mergeX} ${mid} H ${courseX - 2}`} />
                <Head x={courseX - 2} y={mid} />
              </>
            ) : placed.length === 1 ? (
              <>
                <Line d={`M ${REQUIRES_W} ${mid} H ${courseX - 2}`} />
                <Head x={courseX - 2} y={mid} />
              </>
            ) : null}
            {unlocks.length === 1 ? (
              <>
                <Line d={`M ${courseX + COURSE_W} ${mid} H ${unlockX - 2}`} />
                <Head x={unlockX - 2} y={mid} />
              </>
            ) : unlocks.length > 1 ? (
              <>
                <Line d={`M ${courseX + COURSE_W} ${mid} H ${spineX}`} />
                <Line
                  d={`M ${spineX} ${unlockCentre(0)} V ${unlockCentre(unlocks.length - 1)}`}
                />
                {unlocks.map((unlock, index) => (
                  <g key={unlock.code}>
                    <Line
                      d={`M ${spineX} ${unlockCentre(index)} H ${unlockX - 2}`}
                    />
                    <Head x={unlockX - 2} y={unlockCentre(index)} />
                  </g>
                ))}
              </>
            ) : null}
          </svg>

          {placed.length === 0 ? (
            <Placeholder
              label={
                hasPrerequisiteWording
                  ? "See the requirements below"
                  : "No course prerequisites"
              }
              style={{
                left: 0,
                width: REQUIRES_W,
                top: mid - EMPTY_H / 2,
                height: EMPTY_H,
              }}
            />
          ) : (
            placed.map((entry, index) =>
              entry.node.kind === "group" ? (
                <GroupBox
                  key={index}
                  group={entry.node}
                  className="absolute"
                  style={{ left: 0, width: REQUIRES_W, top: entry.top }}
                  {...shared}
                />
              ) : (
                <Leaf
                  key={index}
                  node={entry.node}
                  className="absolute"
                  style={{ left: 0, width: REQUIRES_W, top: entry.top }}
                  {...shared}
                />
              ),
            )
          )}

          {/* The badge hangs below the node without taking layout height, so
              the node's centre stays level with every line that meets it. */}
          <div
            className="absolute"
            style={{ left: courseX, width: COURSE_W, top: mid - COURSE_H / 2 }}
          >
            <span
              aria-current="page"
              className="flex h-12 items-center justify-center rounded-lg bg-primary font-mono text-[13px] font-semibold text-white shadow-sm"
            >
              {code}
            </span>
            {permissions.length ? (
              <span className="absolute inset-x-0 top-full mt-1.5 flex items-center justify-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
                <KeyRound className="size-3.5" aria-hidden="true" />
                Permission needed
              </span>
            ) : null}
          </div>

          {unlocks.map((unlock, index) => (
            <CourseCard
              key={unlock.code}
              code={unlock.code}
              academicYear={academicYear}
              available={
                unlock.isAvailable || availableCourseCodes.has(unlock.code)
              }
              met={false}
              className="absolute"
              style={{
                left: unlockX,
                width: UNLOCK_W,
                top: unlockCentre(index) - CARD / 2,
              }}
            />
          ))}
        </div>

        {incompatible.length ? (
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <CircleAlert
              className="mt-px size-3.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>
              Not a prerequisite: this course cannot be counted with{" "}
              {incompatible.join(", ")}.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
