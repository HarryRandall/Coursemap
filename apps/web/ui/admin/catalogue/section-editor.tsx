"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { Plus, Trash2 } from "lucide-react";

type Scalar = string | number | boolean | null;
type Row = Record<string, Scalar>;

const LONG_TEXT_KEYS = new Set([
  "description",
  "introduction",
  "markdown",
  "body",
  "outcomeText",
  "sourceText",
  "workloadText",
  "inherentRequirements",
  "prescribedTexts",
  "contactText",
  "convenerText",
  "deliverySummary",
]);

function humanise(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function parseScalar(previous: Scalar, raw: string): Scalar {
  if (raw === "") return null;
  if (typeof previous === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : previous;
  }
  return raw;
}

/**
 * A value nobody is being invited to change: the label and what it says. Used
 * for fields the record owns rather than the author, and for every field while
 * a record is being read rather than edited.
 */
function ReadOnlyField({ label, value }: { label: string; value: Scalar }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">
        {value === null || value === "" ? "\u2014" : String(value)}
      </span>
    </div>
  );
}

/** One typed input for a scalar value, with null rendered as empty. */
export function ScalarField({
  id,
  label,
  value,
  onChange,
  long = false,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: Scalar;
  onChange: (value: Scalar) => void;
  long?: boolean;
  readOnly?: boolean;
}) {
  if (readOnly) return <ReadOnlyField label={label} value={value} />;
  if (
    typeof value === "boolean" ||
    (value === null && /^(can|is|has|hurdle)/.test(label))
  ) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" htmlFor={id}>
          {label}
        </label>
        <select
          id={id}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={value === null ? "" : value ? "true" : "false"}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? null : event.target.value === "true",
            )
          }
        >
          <option value="">Not set</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  }
  const text = value === null ? "" : String(value);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      {long ? (
        <Textarea
          id={id}
          value={text}
          rows={4}
          onChange={(event) => onChange(parseScalar(value, event.target.value))}
        />
      ) : (
        <Input
          id={id}
          type={typeof value === "number" ? "number" : "text"}
          step={typeof value === "number" ? "any" : undefined}
          value={text}
          onChange={(event) => onChange(parseScalar(value, event.target.value))}
        />
      )}
    </div>
  );
}

/** A form over a flat object of scalars, such as a snapshot's details. */
export function DetailsEditor({
  idPrefix,
  value,
  onChange,
  labels = {},
  readOnlyKeys = [],
  readOnly = false,
}: {
  idPrefix: string;
  value: Row;
  onChange: (value: Row) => void;
  labels?: Record<string, string>;
  readOnlyKeys?: string[];
  /** Reads the whole form rather than offering it for editing. */
  readOnly?: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(value).map(([key, fieldValue]) => {
        const long = LONG_TEXT_KEYS.has(key);
        return (
          <div key={key} className={long ? "md:col-span-2" : undefined}>
            <ScalarField
              id={`${idPrefix}-${key}`}
              label={labels[key] ?? humanise(key)}
              value={fieldValue}
              long={long}
              readOnly={readOnly || readOnlyKeys.includes(key)}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Rows of scalars with add and remove. New rows copy the shape of an
 * existing row or the template; positions renumber on save.
 */
export function RowsEditor({
  idPrefix,
  rows,
  onChange,
  template,
  hiddenKeys = ["position"],
  emptyLabel,
  readOnly = false,
}: {
  idPrefix: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  template: Row;
  hiddenKeys?: string[];
  emptyLabel: string;
  /** Lists the rows as they stand, without add, remove or entry. */
  readOnly?: boolean;
}) {
  const shape = rows[0] ?? template;
  const keys = Object.keys(shape).filter((key) => !hiddenKeys.includes(key));
  const renumber = (next: Row[]) =>
    next.map((row, index) => ({ ...row, position: index + 1 }));
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li key={index} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Item {index + 1}
              </span>
              {readOnly ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() =>
                    onChange(
                      renumber(
                        rows.filter((_, candidate) => candidate !== index),
                      ),
                    )
                  }
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {keys.map((key) => {
                const long = LONG_TEXT_KEYS.has(key);
                return (
                  <div key={key} className={long ? "md:col-span-2" : undefined}>
                    <ScalarField
                      id={`${idPrefix}-${index}-${key}`}
                      label={humanise(key)}
                      value={row[key] ?? null}
                      long={long}
                      readOnly={readOnly}
                      onChange={(next) =>
                        onChange(
                          rows.map((candidate, at) =>
                            at === index
                              ? { ...candidate, [key]: next }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {readOnly ? null : (
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="self-start"
          onClick={() =>
            onChange(
              renumber([
                ...rows,
                Object.fromEntries(
                  Object.entries(shape).map(([key, sample]) => [
                    key,
                    key === "position"
                      ? rows.length + 1
                      : typeof sample === "number"
                        ? null
                        : typeof sample === "boolean"
                          ? null
                          : "",
                  ]),
                ) as Row,
              ]),
            )
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add item
        </Button>
      )}
    </div>
  );
}
