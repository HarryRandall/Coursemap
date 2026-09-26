"use client";

import Link from "next/link";
import { useState } from "react";
import {
  COMPOSITION_SLOT_UNITS,
  compositionSectionUnits,
  type CompositionSection,
} from "@/lib/coursemap/degree-composition";
import { CompositionSlot } from "./composition-slot";
import styles from "./composition-block.module.css";

/** Inset and gap of the slot grid, matching composition-block.module.css. */
const SLOT_INSET = 6;
const SLOT_GAP = 5;
const MIN_SLOT = { width: 56, height: 30 };
/** Slots read best a little wider than tall. */
const SLOT_ASPECT = 1.5;

/**
 * The slot grid for a block: as many cells as fit at a readable size, filled
 * edge to edge. Courses always get a cell (or a "more" cell); empty 6-unit
 * places are only a hint of remaining room, so surplus ones are left out.
 */
function slotGrid(
  courses: number,
  slots: number,
  width: number,
  height: number,
) {
  const areaWidth = width - SLOT_INSET * 2;
  const areaHeight = height - SLOT_INSET * 2;
  const fit = (size: number, minimum: number) =>
    Math.max(1, Math.floor((size + SLOT_GAP) / (minimum + SLOT_GAP)));
  const maxColumns = fit(areaWidth, MIN_SLOT.width);
  const maxRows = fit(areaHeight, MIN_SLOT.height);
  let best = { columns: 1, rows: 1, score: Infinity };
  for (let columns = 1; columns <= maxColumns; columns += 1) {
    for (let rows = 1; rows <= maxRows; rows += 1) {
      const cells = columns * rows;
      // Never add empty places beyond the section's room, and never hide a
      // course when a larger grid could still show it.
      if (cells > Math.max(slots, 1)) continue;
      const cellWidth = (areaWidth - (columns - 1) * SLOT_GAP) / columns;
      const cellHeight = (areaHeight - (rows - 1) * SLOT_GAP) / rows;
      const shape = Math.abs(Math.log(cellWidth / cellHeight / SLOT_ASPECT));
      const hidden = slots - cells;
      const hiddenCourses = Math.max(0, courses - cells);
      const score = shape + hidden * 0.08 + hiddenCourses * 10;
      if (score < best.score) best = { columns, rows, score };
    }
  }
  return { columns: best.columns, rows: best.rows };
}

/**
 * A section of the degree that opens into its courses on hover or activation,
 * with an empty slot for each 6 units still to fill.
 */
export function CompositionBlock({
  section,
  title,
  colour,
  width,
  height,
  courseHref,
  emptyHref,
}: {
  section: CompositionSection;
  title: string;
  colour: string;
  /** Rendered size of the block in pixels, to fit its slots. */
  width: number;
  height: number;
  courseHref: (code: string) => string;
  emptyHref: string;
}) {
  const [open, setOpen] = useState(false);
  const units = compositionSectionUnits(section);
  const mapped = section.courses.reduce((total, item) => total + item.units, 0);
  const emptySlots = Math.ceil(
    Math.max(0, units - mapped) / COMPOSITION_SLOT_UNITS,
  );
  const total = section.courses.length + emptySlots;
  const { columns, rows } = slotGrid(
    section.courses.length,
    total,
    width,
    height,
  );
  const cells = columns * rows;
  // When courses outnumber the cells, the last cell counts the rest.
  const overflow =
    section.courses.length > cells ? section.courses.length - cells + 1 : 0;
  const slots = [
    ...section.courses,
    ...Array.from({ length: emptySlots }, () => null),
  ].slice(0, overflow ? cells - 1 : cells);
  const summary = [
    title,
    section.structureName,
    `${units} units`,
    `${mapped} mapped`,
  ].filter(Boolean);
  return (
    <div
      className={`${styles.block} ${colour} relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg`}
      data-open={open}
      data-kind={section.kind}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget.querySelector("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        className={`${styles.trigger} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`}
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        aria-label={summary.join(", ")}
        onClick={(event) => setOpen(event.detail > 0 ? true : !open)}
      >
        <span className={styles.heading}>
          <strong>{title}</strong>
          {section.structureName ? (
            <span className={styles.name}>{section.structureName}</span>
          ) : null}
          <span className={styles.units}>{units} units</span>
        </span>
      </button>
      <div
        inert={!open}
        className={styles.slots}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {slots.map((course, index) => (
          <CompositionSlot
            key={course?.code ?? `empty-${index}`}
            course={course}
            href={course ? courseHref(course.code) : emptyHref}
            emptyUnits={COMPOSITION_SLOT_UNITS}
            emptyLabel={`Find a course for ${title}, ${COMPOSITION_SLOT_UNITS} units`}
          />
        ))}
        {overflow ? (
          <Link
            href={emptyHref}
            className={`${styles.slot} text-[10px] focus-visible:outline-2 focus-visible:outline-ring`}
            data-status="More"
            aria-label={`${overflow} more courses in ${title}`}
          >
            +{overflow}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
