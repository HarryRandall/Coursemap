import { humaniseKey } from "@/lib/coursemap/catalogue-kinds";

/**
 * A readable view of an extracted value. Reviewers compare content, not JSON,
 * so objects become definition lists and arrays become stacks. Anything the
 * pipeline cannot name still renders as text rather than being hidden.
 */
export function CatalogueValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">Not set</span>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (Array.isArray(value))
    return value.length ? (
      <ul className="flex flex-col gap-2">
        {value.map((entry, index) => (
          <li key={index}>
            <CatalogueValue value={entry} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-muted-foreground">None</span>
    );
  if (typeof value === "object")
    return (
      <dl className="flex flex-col gap-1">
        {Object.entries(value)
          .filter(([, child]) => child !== null && child !== "")
          .map(([key, child]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">
                {humaniseKey(key)}
              </dt>
              <dd>
                <CatalogueValue value={child} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return (
    <span className="break-words whitespace-pre-wrap">{String(value)}</span>
  );
}
