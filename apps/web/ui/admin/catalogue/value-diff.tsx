import { fieldLabel, humaniseKey } from "@/lib/coursemap/catalogue-kinds";
import { JsonCode } from "@/ui/common/json-code";
import { CatalogueValue } from "./catalogue-value";

/**
 * A field the reviewer has to judge, with the value on each side. One change
 * row may produce several of these, because changes.ts records a whole
 * collection as a single entry.
 */
type DiffField = {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
};

/** Beyond this the walk stops helping and the raw values are clearer. */
const MAX_FIELDS = 60;

function same(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix: string,
): DiffField[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.flatMap((key) =>
    same(before[key], after[key])
      ? []
      : [
          {
            key: `${prefix}${key}`,
            label: humaniseKey(key),
            before: before[key],
            after: after[key],
          },
        ],
  );
}

/**
 * Walks into the change so the reviewer sees the fields that actually differ.
 * changes.ts diffs whole collections, so a single altered delivery mode
 * arrives as an entry whose values are the entire session array; rendering
 * that as two blocks of JSON made the reviewer diff it by eye.
 */
function diffFields(
  fieldPath: string,
  oldValue: unknown,
  newValue: unknown,
): DiffField[] | null {
  if (Array.isArray(oldValue) || Array.isArray(newValue)) {
    const before = Array.isArray(oldValue) ? oldValue : [];
    const after = Array.isArray(newValue) ? newValue : [];
    const fields: DiffField[] = [];
    for (
      let index = 0;
      index < Math.max(before.length, after.length);
      index++
    ) {
      const left = before[index];
      const right = after[index];
      if (same(left, right)) continue;
      const position = `Item ${index + 1}`;
      if (
        left === undefined ||
        right === undefined ||
        !isRecord(left) ||
        !isRecord(right)
      ) {
        fields.push({
          key: `${fieldPath}[${index}]`,
          label:
            left === undefined
              ? `${position} (added)`
              : right === undefined
                ? `${position} (removed)`
                : position,
          before: left,
          after: right,
        });
        continue;
      }
      for (const field of recordFields(
        left,
        right,
        `${fieldPath}[${index}].`,
      )) {
        fields.push({ ...field, label: `${position} · ${field.label}` });
      }
    }
    return fields.length && fields.length <= MAX_FIELDS ? fields : null;
  }

  if (isRecord(oldValue) && isRecord(newValue)) {
    const fields = recordFields(oldValue, newValue, `${fieldPath}.`);
    return fields.length && fields.length <= MAX_FIELDS ? fields : null;
  }

  return [
    {
      key: fieldPath,
      label: fieldLabel(fieldPath),
      before: oldValue,
      after: newValue,
    },
  ];
}

function Side({
  tone,
  heading,
  value,
}: {
  tone: "before" | "after";
  heading: string;
  value: unknown;
}) {
  return (
    <div
      className={
        tone === "before"
          ? "min-w-0 bg-rose-500/5 px-4 py-3"
          : "min-w-0 bg-emerald-500/5 px-4 py-3"
      }
    >
      <p
        className={
          tone === "before"
            ? "mb-1.5 text-xs font-medium text-rose-700 dark:text-rose-300"
            : "mb-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        }
      >
        {tone === "before" ? "−" : "+"} {heading}
      </p>
      <div className="text-sm leading-6">
        <CatalogueValue value={value} />
      </div>
    </div>
  );
}

export function ValueDiff({
  fieldPath,
  oldValue,
  newValue,
}: {
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
}) {
  const fields = diffFields(fieldPath, oldValue, newValue);
  // A walked field names itself, because which row changed is the point. Only
  // a plain scalar, whose heading is already the change row, goes unlabelled.
  const labelled = !(fields?.length === 1 && fields[0]?.key === fieldPath);

  if (!fields)
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <JsonCode value={oldValue ?? null} label={`Current ${fieldPath}`} />
        <JsonCode value={newValue ?? null} label={`Imported ${fieldPath}`} />
      </div>
    );

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {fields.map((field, index) => (
        <div
          key={field.key}
          className={index > 0 ? "border-t border-border" : undefined}
        >
          {labelled ? (
            <p className="bg-muted/40 px-4 py-1.5 text-xs font-medium">
              {field.label}
            </p>
          ) : null}
          <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
            <Side tone="before" heading="Current" value={field.before} />
            <Side tone="after" heading="Imported" value={field.after} />
          </div>
        </div>
      ))}
    </div>
  );
}
