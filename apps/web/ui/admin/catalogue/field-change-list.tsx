export type FieldChangeItem = {
  fieldPath: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
};

/** A short, readable stand-in for a stored value of any shape. */
export function describeFieldValue(value: unknown) {
  if (value === null || value === undefined) return "Not set";
  if (Array.isArray(value))
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "A value";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  if (text === "") return "Not set";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/** What changed, one field to a line, oldest value first. */
export function FieldChangeList({
  changes,
  bordered = true,
}: {
  changes: readonly FieldChangeItem[];
  bordered?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {changes.map((change) => (
        <li
          className={
            bordered
              ? "rounded-xl border border-border bg-card p-4"
              : "border-t border-border pt-2 first:border-t-0 first:pt-0"
          }
          key={change.fieldPath}
        >
          <p className="text-sm font-medium">{change.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="break-words">
              {describeFieldValue(change.oldValue)}
            </span>
            <span aria-hidden="true"> → </span>
            <span className="sr-only">becomes</span>
            <span className="break-words text-foreground">
              {describeFieldValue(change.newValue)}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
