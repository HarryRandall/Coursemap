/** A course Compass looked up, shown as a card when its code appears in a reply. */
export type AssistantCourseReference = {
  code: string;
  name: string;
  year: number;
  units: number;
  sessions: string[];
  prerequisites: string | null;
  level?: number;
  /** Where the course sits in the student's plan, such as "Planned for S1 2027". */
  planStatus?: string;
  /** Known only for courses in the plan, where the planner has checked them. */
  prerequisitesMet?: boolean;
};

/** A student society Compass found, shown as a card under the reply. */
export type AssistantSociety = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  logoUrl?: string;
};

/** A campus place, with the start point when the student asked for directions. */
export type AssistantPlace = {
  slug: string;
  name: string;
  address: string;
  from?: { slug: string; name: string };
};

export type AssistantVisual =
  | {
      kind: "meter";
      title: string;
      value: number;
      max: number;
      /** The value a rule requires, drawn as a marker on the scale. */
      target?: number;
      unit?: string;
    }
  | {
      kind: "bars";
      title: string;
      unit?: string;
      /** `value` is done; `planned` is scheduled on top of it. */
      items: Array<{
        label: string;
        value: number;
        planned?: number;
        target?: number;
      }>;
    }
  | {
      /** One or more series over study periods, shown one at a time. */
      kind: "line";
      title: string;
      series: Array<{
        name: string;
        /** The scale to draw against, such as 0 to 7 for a GPA. */
        min: number;
        max: number;
        points: Array<{ label: string; value: number }>;
      }>;
    }
  | {
      /** Vertical columns, such as units per study period or grade counts. */
      kind: "columns";
      title: string;
      unit?: string;
      /** "currency" formats values as dollars and totals them. */
      format?: "number" | "currency";
      /** "grades" colours each column by its grade, like the result chips. */
      palette?: "brand" | "grades";
      items: Array<{
        label: string;
        value: number;
        /** Stacked above `value` in a lighter shade. */
        planned?: number;
        /** Shown on hover, such as the grade's full name. */
        detail?: string;
      }>;
      /** A horizontal guide such as the standard 24-unit load. */
      reference?: { value: number; label: string };
      note?: string;
    };

export const ASSISTANT_VISUAL_MAX_BARS = 12;
const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,120}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function label(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(value: unknown) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

export function readCourseReference(
  value: unknown,
): AssistantCourseReference | null {
  const course = record(value);
  if (!course) return null;
  const code = typeof course.code === "string" ? course.code : "";
  const name = label(course.name, 160);
  const year = finite(course.year);
  const units = nonNegative(course.units);
  if (
    !COURSE_CODE_PATTERN.test(code) ||
    !name ||
    year === null ||
    units === null
  )
    return null;
  return {
    code,
    name,
    year,
    units,
    sessions: Array.isArray(course.sessions)
      ? course.sessions
          .flatMap((session) => label(session, 60) ?? [])
          .slice(0, 8)
      : [],
    prerequisites: label(course.prerequisites, 400),
    ...(finite(course.level) !== null ? { level: finite(course.level)! } : {}),
    ...(label(course.planStatus, 60)
      ? { planStatus: label(course.planStatus, 60)! }
      : {}),
    ...(typeof course.prerequisitesMet === "boolean"
      ? { prerequisitesMet: course.prerequisitesMet }
      : {}),
  };
}

export function readSociety(value: unknown): AssistantSociety | null {
  const society = record(value);
  const slug = typeof society?.slug === "string" ? society.slug : "";
  const name = label(society?.name, 120);
  if (!society || !SLUG_PATTERN.test(slug) || !name) return null;
  const logoUrl =
    typeof society.logoUrl === "string" && /^https:\/\//u.test(society.logoUrl)
      ? society.logoUrl
      : undefined;
  return {
    slug,
    name,
    category: label(society.category, 60) ?? "",
    summary: label(society.summary, 280) ?? "",
    ...(logoUrl ? { logoUrl } : {}),
  };
}

export function readPlace(value: unknown): AssistantPlace | null {
  const place = record(value);
  const slug = typeof place?.slug === "string" ? place.slug : "";
  const name = label(place?.name, 120);
  if (!place || !SLUG_PATTERN.test(slug) || !name) return null;
  const from = record(place.from);
  const fromSlug = typeof from?.slug === "string" ? from.slug : "";
  const fromName = label(from?.name, 120);
  return {
    slug,
    name,
    address: label(place.address, 160) ?? "",
    ...(from && SLUG_PATTERN.test(fromSlug) && fromName
      ? { from: { slug: fromSlug, name: fromName } }
      : {}),
  };
}

/**
 * Accepts a visual the model asked for, or one restored from browser storage.
 * Anything malformed is dropped rather than drawn misleadingly.
 */
export function readAssistantVisual(value: unknown): AssistantVisual | null {
  const visual = record(value);
  const title = label(visual?.title, 120);
  if (!visual || !title) return null;
  const unit = label(visual.unit, 24) ?? undefined;
  if (visual.kind === "meter") {
    const max = finite(visual.max);
    const current = finite(visual.value);
    const target = finite(visual.target);
    if (max === null || max <= 0 || current === null) return null;
    const clamp = (number: number) => Math.min(max, Math.max(0, number));
    return {
      kind: "meter",
      title,
      value: clamp(current),
      max,
      ...(target !== null ? { target: clamp(target) } : {}),
      ...(unit ? { unit } : {}),
    };
  }
  if (visual.kind === "bars" && Array.isArray(visual.items)) {
    const items = visual.items
      .flatMap((item) => {
        const bar = record(item);
        const name = label(bar?.label, 60);
        const amount = nonNegative(bar?.value);
        const target = nonNegative(bar?.target);
        const planned = nonNegative(bar?.planned);
        if (!name || amount === null) return [];
        return [
          {
            label: name,
            value: amount,
            ...(planned ? { planned } : {}),
            ...(target !== null ? { target } : {}),
          },
        ];
      })
      .slice(0, ASSISTANT_VISUAL_MAX_BARS);
    return items.length
      ? { kind: "bars", title, items, ...(unit ? { unit } : {}) }
      : null;
  }
  if (visual.kind === "line" && Array.isArray(visual.series)) {
    const series = visual.series
      .flatMap((item) => {
        const line = record(item);
        const name = label(line?.name, 40);
        const min = finite(line?.min);
        const max = finite(line?.max);
        if (!line || !name || min === null || max === null || max <= min)
          return [];
        const points = Array.isArray(line.points)
          ? line.points
              .flatMap((point) => {
                const entry = record(point);
                const pointLabel = label(entry?.label, 24);
                const pointValue = finite(entry?.value);
                return pointLabel && pointValue !== null
                  ? [{ label: pointLabel, value: pointValue }]
                  : [];
              })
              .slice(0, 24)
          : [];
        return points.length ? [{ name, min, max, points }] : [];
      })
      .slice(0, 3);
    return series.length ? { kind: "line", title, series } : null;
  }
  if (visual.kind === "columns" && Array.isArray(visual.items)) {
    const items = visual.items
      .flatMap((item) => {
        const column = record(item);
        const name = label(column?.label, 24);
        const amount = nonNegative(column?.value);
        if (!name || amount === null) return [];
        const planned = nonNegative(column?.planned);
        const detail = label(column?.detail, 80);
        return [
          {
            label: name,
            value: amount,
            ...(planned ? { planned } : {}),
            ...(detail ? { detail } : {}),
          },
        ];
      })
      .slice(0, 16);
    if (!items.length) return null;
    const reference = record(visual.reference);
    const referenceValue = nonNegative(reference?.value);
    const referenceLabel = label(reference?.label, 40);
    const note = label(visual.note, 160);
    return {
      kind: "columns",
      title,
      items,
      ...(unit ? { unit } : {}),
      ...(visual.format === "currency" ? { format: "currency" as const } : {}),
      ...(visual.palette === "grades" ? { palette: "grades" as const } : {}),
      ...(referenceValue !== null && referenceLabel
        ? { reference: { value: referenceValue, label: referenceLabel } }
        : {}),
      ...(note ? { note } : {}),
    };
  }
  return null;
}
