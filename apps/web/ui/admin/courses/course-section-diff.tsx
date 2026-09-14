import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
import {
  courseSectionValue,
  type CourseReviewSection,
} from "@/lib/coursemap/course-review-sections";

function text(value: unknown): string {
  if (value === null || value === undefined) return "Not provided";
  if (Array.isArray(value)) return value.map(text).join("\n\n");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, value]) => `${key}: ${text(value)}`)
      .join("\n");
  return String(value);
}

export function CourseSectionDiff({
  section,
  before,
  after,
}: {
  section: CourseReviewSection;
  before: CourseSnapshotProjectionData;
  after: CourseSnapshotProjectionData;
}) {
  const oldValue = courseSectionValue(section, before);
  const newValue = courseSectionValue(section, after);
  if (JSON.stringify(oldValue) === JSON.stringify(newValue))
    return (
      <p className="border-t px-5 py-3 text-xs text-muted-foreground">
        No changes from the published version.
      </p>
    );
  function collectionText(value: unknown) {
    if (!Array.isArray(value)) return text(value);
    return value
      .map((row) =>
        section.fields
          .map((field) => `${field.label}: ${text(row[field.key])}`)
          .join("\n"),
      )
      .join("\n\n");
  }
  const fields = section.collection
    ? [
        {
          label: section.title,
          before: collectionText(oldValue),
          after: collectionText(newValue),
        },
      ]
    : section.fields.flatMap((field) => {
        const previous =
          before.snapshot[field.key as keyof typeof before.snapshot];
        const current =
          after.snapshot[field.key as keyof typeof after.snapshot];
        return JSON.stringify(previous) === JSON.stringify(current)
          ? []
          : [{ label: field.label, before: previous, after: current }];
      });
  return (
    <div
      aria-label="Changes from published"
      className="border-t border-border/60"
    >
      {fields.map((field) => (
        <div key={field.label}>
          <p className="bg-muted/40 px-5 py-2 text-xs font-medium">
            {field.label}
          </p>
          <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="min-w-0 bg-rose-500/5 px-5 py-3">
              <p className="mb-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                − Published
              </p>
              <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                {text(field.before)}
              </p>
            </div>
            <div className="min-w-0 bg-emerald-500/5 px-5 py-3">
              <p className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                + Draft
              </p>
              <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                {text(field.after)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
