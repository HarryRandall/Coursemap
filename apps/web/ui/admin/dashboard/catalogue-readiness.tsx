import { Hint } from "@/ui/common/hint";
import type { AdminDashboardData } from "@/lib/admin/dashboard";
import { ShareRing } from "@/ui/common/share-ring";
import { formatCount } from "@/lib/canberra-format";

function share(published: number, total: number) {
  return total === 0 ? null : published / total;
}

function yearSummary(year: number, published: number, total: number) {
  return total === 0
    ? `${year}: not imported`
    : `${year}: ${published} of ${total} published`;
}

/** Two rings per catalogue type: this year outside, next year inside. */
export function CatalogueReadiness({
  readiness,
}: {
  readiness: AdminDashboardData["readiness"];
}) {
  const [current, next] = readiness[0]?.years.map((entry) => entry.year) ?? [];
  return (
    <figure className="flex h-full flex-col justify-between gap-5">
      <ul className="grid flex-1 grid-cols-3 content-center gap-x-3 gap-y-5 sm:grid-cols-5">
        {readiness.map((entry) => {
          const [thisYear, nextYear] = entry.years;
          const summary = entry.years
            .map((year) => yearSummary(year.year, year.published, year.total))
            .join(". ");
          const outer = share(thisYear.published, thisYear.total);
          return (
            <li
              key={entry.kind}
              className="flex min-w-0 flex-col items-center gap-1.5"
            >
              <Hint label={summary}>
                <span className="grid w-full max-w-36 place-items-center rounded-full">
                  {/* Drawn at 120 and scaled to the column, so the rings
                      grow to fill whatever width the panel has. */}
                  <ShareRing
                    size={120}
                    thickness={11}
                    className="h-auto w-full"
                    centre={
                      outer === null ? "–" : `${Math.round(outer * 100)}%`
                    }
                    label={`${entry.label}. ${summary}`}
                    values={[
                      { share: outer, tone: "primary" },
                      {
                        share: share(nextYear.published, nextYear.total),
                        tone: "secondary",
                      },
                    ]}
                  />
                </span>
              </Hint>
              <span className="text-sm font-medium">{entry.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {thisYear.total === 0
                  ? "Not imported"
                  : `${formatCount(thisYear.published)} of ${formatCount(thisYear.total)}`}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-primary"
          />
          {current} published, outer ring
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-primary/45"
          />
          {next}, inner ring
        </span>
      </figcaption>
    </figure>
  );
}
