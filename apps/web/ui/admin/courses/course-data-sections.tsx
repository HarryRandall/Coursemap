"use client";
import { useCatalogueAutosave } from "@/ui/admin/imports/use-catalogue-autosave";

import { useRef, useState, type FormEvent } from "react";
import { CourseUnitOptionsEditor } from "./course-unit-options-editor";
import { CourseSourceEvidence } from "./course-source-evidence";
import {
  courseReviewSections,
  type CourseReviewSection as Section,
  type CourseReviewField as Field,
} from "@/lib/coursemap/course-review-sections";
import { CourseSectionDiff } from "./course-section-diff";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { OptionPicker } from "@/ui/common/option-picker";
import type { CourseSnapshotProjectionData as Projection } from "@/lib/course-import/project-snapshot";
import type { AdminCourseYearRecord } from "@/lib/coursemap/admin-course-year";
import {
  collectionEditorValue,
  preparedProjection,
} from "@/lib/coursemap/course-workspace-projection";

function readable(value: unknown) {
  if (value === null || value === undefined || value === "")
    return "Not provided";
  return String(value).replaceAll("_", " ");
}

function rowsFor(
  section: Section,
  projection: Projection,
): Record<string, unknown>[] {
  if (!section.collection) return [projection.snapshot];
  const value = projection[section.collection];
  return Array.isArray(value)
    ? (value as unknown as Record<string, unknown>[])
    : [];
}

export function CourseDataSections({
  canEdit,
  onSave,
  onEditingChange,
  record,
  sectionKey,
  compare = false,
}: {
  sectionKey: string;
  compare?: boolean;
  canEdit: boolean;
  onSave: (projection: Projection) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
  record: AdminCourseYearRecord;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Projection | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef<string | null>(null);
  const projection = record.projection;

  function begin(section: Section) {
    lastSaved.current = JSON.stringify(projection);
    setDraft(structuredClone(projection!));
    setEditing(section.key);
    onEditingChange?.(true);
    setError(null);
  }

  function update(
    section: Section,
    index: number,
    field: Field,
    value: string,
  ) {
    if (!draft) return;
    const next = structuredClone(draft);
    const row = rowsFor(section, next)[index];
    row[field.key] =
      field.kind === "number"
        ? value.trim()
          ? Number(value)
          : null
        : field.kind === "boolean"
          ? value === "not_recorded"
            ? null
            : value === "true"
          : value || (field.required ? "" : null);
    setDraft(next);
  }

  async function save(event?: FormEvent, finish = true) {
    event?.preventDefault();
    if (!draft) return;
    if (JSON.stringify(draft) === lastSaved.current) {
      if (finish) {
        setEditing(null);
        onEditingChange?.(false);
        setDraft(null);
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Validate the complete projection so section edits cannot break linked rows.
      const next = preparedProjection(
        record,
        draft.snapshot,
        collectionEditorValue(draft),
      );
      await onSave(next);
      lastSaved.current = JSON.stringify(draft);
      if (finish) {
        setEditing(null);
        onEditingChange?.(false);
        setDraft(null);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The section could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  useCatalogueAutosave(draft, editing !== null, () => save(undefined, false));
  if (!projection)
    return (
      <p className="py-10 text-sm text-muted-foreground">
        No course data is available.
      </p>
    );

  return (
    <div className="space-y-5">
      {courseReviewSections
        .filter((section) => section.key === sectionKey)
        .map((section) => {
          const isEditing = editing === section.key && draft !== null;
          const rows = rowsFor(section, isEditing ? draft : projection);
          const evidence = record.evidence.filter(
            (item) =>
              item.evidence_excerpt &&
              (section.fields.some((field) => field.key === item.field_key) ||
                item.field_key === section.collection),
          );
          const originalRows = record.sourceOriginalProjection
            ? rowsFor(section, record.sourceOriginalProjection)
            : [];
          const sourceTexts = evidence.length
            ? evidence.map((item) => item.evidence_excerpt!)
            : originalRows.flatMap((row) =>
                typeof row.sourceText === "string" && row.sourceText
                  ? [row.sourceText]
                  : [],
              );
          return (
            <section
              id={`course-section-${section.key}`}
              aria-label={section.title}
              className="scroll-mt-44 rounded-xl border border-border bg-card"
              key={section.key}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold">{section.title}</h2>
                <div className="flex items-center gap-2">
                  {!isEditing && canEdit ? (
                    <Button
                      disabled={editing !== null}
                      onClick={() => begin(section)}
                      size="sm"
                      variant="outline"
                      type="button"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
              <CourseSourceEvidence
                texts={sourceTexts}
                sourceUrl={record.sourcePage?.canonical_url}
              />
              {compare && record.publishedProjection && !isEditing ? (
                <CourseSectionDiff
                  section={section}
                  before={record.publishedProjection}
                  after={projection}
                />
              ) : null}
              <div
                className="border-t border-border/60"
                hidden={compare && !!record.publishedProjection && !isEditing}
              >
                <form
                  onSubmit={(event) => void save(event)}
                  className="min-w-0 px-5 pb-5 sm:px-6"
                >
                  {isEditing ? (
                    <p
                      role="status"
                      className="pt-3 text-xs text-muted-foreground"
                    >
                      {saving
                        ? "Saving…"
                        : error
                          ? "Changes not saved"
                          : "Changes save automatically"}
                    </p>
                  ) : null}
                  {rows.length ? (
                    <div className="divide-y divide-border/60">
                      {rows.map((row, index) => (
                        <div className="py-4" key={index}>
                          <div
                            className={
                              isEditing
                                ? "grid gap-4 sm:grid-cols-2"
                                : "grid gap-x-6 gap-y-4 sm:grid-cols-2"
                            }
                          >
                            {section.fields.map((field) => {
                              if (
                                !isEditing &&
                                field.key === "description" &&
                                row.description === row.introduction
                              )
                                return null;
                              if (
                                !isEditing &&
                                (row[field.key] === null ||
                                  row[field.key] === "") &&
                                section.collection
                              )
                                return null;
                              return (
                                <div
                                  className={
                                    field.kind === "long" ? "sm:col-span-2" : ""
                                  }
                                  key={field.key}
                                >
                                  {isEditing ? (
                                    <label className="flex flex-col gap-2 text-sm">
                                      <span className="font-medium">
                                        {field.label}
                                      </span>
                                      {field.kind === "boolean" ? (
                                        <OptionPicker
                                          aria-label={field.label}
                                          value={
                                            row[field.key] === null
                                              ? "not_recorded"
                                              : String(row[field.key])
                                          }
                                          items={[
                                            {
                                              value: "not_recorded",
                                              label: "Not recorded",
                                            },
                                            { value: "true", label: "Yes" },
                                            { value: "false", label: "No" },
                                          ]}
                                          onValueChange={(value) =>
                                            update(section, index, field, value)
                                          }
                                        />
                                      ) : field.kind === "choice" ? (
                                        <OptionPicker
                                          aria-label={field.label}
                                          value={String(row[field.key] ?? "")}
                                          items={(field.options ?? []).map(
                                            (value) => ({
                                              value,
                                              label: readable(value),
                                            }),
                                          )}
                                          onValueChange={(value) =>
                                            update(section, index, field, value)
                                          }
                                        />
                                      ) : field.kind === "long" ? (
                                        <Textarea
                                          className="min-h-28"
                                          value={String(row[field.key] ?? "")}
                                          onChange={(event) =>
                                            update(
                                              section,
                                              index,
                                              field,
                                              event.target.value,
                                            )
                                          }
                                          required={field.required}
                                        />
                                      ) : (
                                        <Input
                                          value={String(row[field.key] ?? "")}
                                          type={
                                            field.kind === "number"
                                              ? "number"
                                              : "text"
                                          }
                                          step="any"
                                          onChange={(event) =>
                                            update(
                                              section,
                                              index,
                                              field,
                                              event.target.value,
                                            )
                                          }
                                          required={field.required}
                                        />
                                      )}
                                    </label>
                                  ) : (
                                    <>
                                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                                        {field.label}
                                      </p>
                                      <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                                        {readable(row[field.key])}
                                      </p>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {isEditing &&
                          section.collection &&
                          !["learningOutcomes", "assessmentItems"].includes(
                            section.collection,
                          ) ? (
                            <Button
                              className="mt-3"
                              aria-label={`Remove ${section.title.toLowerCase()} ${index + 1}`}
                              variant="ghost"
                              size="sm"
                              type="button"
                              onClick={() => {
                                const next = structuredClone(draft);
                                const remaining = rowsFor(section, next)
                                  .filter((_, rowIndex) => index !== rowIndex)
                                  .map((item, rowIndex) => ({
                                    ...item,
                                    position: rowIndex + 1,
                                  }));
                                Object.assign(next, {
                                  [section.collection!]: remaining,
                                });
                                setDraft(next);
                              }}
                            >
                              <Trash2 aria-hidden="true" size={14} />
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-5 text-sm text-muted-foreground">
                      None recorded.
                    </p>
                  )}
                  {isEditing ? (
                    <>
                      {section.key === "units" ? (
                        <CourseUnitOptionsEditor
                          projection={draft}
                          onChange={setDraft}
                        />
                      ) : null}
                      {section.collection && section.emptyRow ? (
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => {
                            const next = structuredClone(draft);
                            const currentRows = rowsFor(section, next);
                            currentRows.push({
                              ...section.emptyRow,
                              position: currentRows.length + 1,
                            });
                            setDraft(next);
                          }}
                        >
                          <Plus aria-hidden="true" size={14} />
                          Add item
                        </Button>
                      ) : null}
                      {error ? (
                        <Alert className="mt-4" variant="destructive">
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      ) : null}
                      <div className="sticky bottom-0 z-10 mt-5 flex justify-end gap-2 border-t border-border/60 bg-card py-4">
                        <Button
                          disabled={saving}
                          onClick={() => {
                            setEditing(null);
                            onEditingChange?.(false);
                            setDraft(null);
                            setError(null);
                          }}
                          variant="outline"
                          type="button"
                        >
                          Cancel
                        </Button>
                        <Button disabled={saving} type="submit">
                          <Save aria-hidden="true" size={14} />
                          {saving ? "Saving..." : "Save section"}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </form>
              </div>
            </section>
          );
        })}
    </div>
  );
}
