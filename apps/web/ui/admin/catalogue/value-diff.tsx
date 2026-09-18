import { JsonCode } from "@/ui/common/json-code";

function isScalar(value: unknown) {
  return (
    value === null || ["string", "number", "boolean"].includes(typeof value)
  );
}

function scalarText(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Old and new values side by side. Scalars render as text; collections and
 * requirement rules render as formatted JSON so nothing is hidden from the
 * reviewer.
 */
export function ValueDiff({
  fieldPath,
  oldValue,
  newValue,
}: {
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
}) {
  const scalar = isScalar(oldValue) && isScalar(newValue);
  return (
    <div className="grid gap-2 text-sm md:grid-cols-2">
      <div className="rounded-md bg-rose-50/60 p-2 dark:bg-rose-950/30">
        <p className="mb-1 text-xs font-medium text-rose-700 dark:text-rose-300">
          Current
        </p>
        {scalar ? (
          <p className="break-words whitespace-pre-wrap">
            {scalarText(oldValue)}
          </p>
        ) : (
          <JsonCode value={oldValue ?? null} label={`Current ${fieldPath}`} />
        )}
      </div>
      <div className="rounded-md bg-emerald-50/60 p-2 dark:bg-emerald-950/30">
        <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Imported
        </p>
        {scalar ? (
          <p className="break-words whitespace-pre-wrap">
            {scalarText(newValue)}
          </p>
        ) : (
          <JsonCode value={newValue ?? null} label={`Imported ${fieldPath}`} />
        )}
      </div>
    </div>
  );
}
