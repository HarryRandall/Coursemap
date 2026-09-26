import { CircleCheck, CircleX } from "lucide-react";
import type { KeyDatesImportRun } from "@/lib/admin/key-dates";

const timestampFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

function Count({ label, value }: { label: string; value: number }) {
  return (
    <span className="tabular-nums">
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}

/** Publications of the year, newest first, from the admin console or the CLI. */
export function KeyDatesHistory({ runs }: { runs: KeyDatesImportRun[] }) {
  if (runs.length === 0) return null;

  return (
    <section aria-labelledby="key-dates-history" className="space-y-3">
      <h2 id="key-dates-history" className="text-sm font-semibold">
        Publishing history
      </h2>
      <ol className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
        {runs.map((run) => (
          <li
            key={run.id}
            className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-3 text-xs text-muted-foreground sm:px-5"
          >
            <span className="flex min-w-48 items-center gap-2 text-sm text-foreground">
              {run.status === "succeeded" ? (
                <CircleCheck
                  aria-label="Published"
                  className="text-emerald-600 dark:text-emerald-400"
                  size={15}
                />
              ) : (
                <CircleX
                  aria-label="Failed"
                  className="text-destructive"
                  size={15}
                />
              )}
              <time dateTime={run.importedAt}>
                {timestampFormat.format(new Date(run.importedAt))}
              </time>
            </span>
            <Count label="added" value={run.added} />
            <Count label="restored" value={run.changed} />
            <Count label="archived" value={run.archived} />
            <Count label="unchanged" value={run.unchanged} />
          </li>
        ))}
      </ol>
    </section>
  );
}
