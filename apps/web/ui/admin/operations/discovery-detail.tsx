import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import type { DiscoveryCheckDetail } from "@/lib/coursemap/admin-operations";
import { formatDuration, formatTimestamp } from "./operations-format";
import { CATALOGUE_OPERATIONS_PATH } from "./operations-tabs";

/**
 * One listing check. Only a complete check can retire a record, so its
 * completeness is the answer to why something says it is no longer listed.
 */
export function DiscoveryDetailView({
  check,
}: {
  check: DiscoveryCheckDetail;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Link
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
        href={`${CATALOGUE_OPERATIONS_PATH}/discovery`}
      >
        <ArrowLeft aria-hidden="true" size={14} />
        Back to discovery
      </Link>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {check.kind} listing
        </h1>
        <Badge variant="outline">{check.academicYear}</Badge>
        <Badge
          variant={
            check.status === "failed"
              ? "destructive-light"
              : check.status === "completed"
                ? "success-light"
                : "info-light"
          }
        >
          {check.status}
        </Badge>
        {check.isComplete ? null : (
          <Badge variant="warning-light">Partial</Badge>
        )}
      </header>

      {check.errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>{check.errorCode ?? "The check failed"}</AlertTitle>
          <AlertDescription>{check.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Discovered", value: String(check.discoveredCount) },
          { label: "Currently listed", value: String(check.listedCount) },
          { label: "No longer listed", value: String(check.retiredCount) },
          { label: "Started", value: formatTimestamp(check.startedAt) },
          { label: "Completed", value: formatTimestamp(check.completedAt) },
          { label: "Duration", value: formatDuration(check.durationMs) },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              {item.label}
            </dt>
            <dd className="mt-0.5 text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Pages read
        </h2>
        {check.sourcePages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This check recorded no source pages.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {check.sourcePages.map((page) => (
              <li
                className="rounded-xl border border-border bg-card p-3 text-sm"
                key={page.id}
              >
                <p className="font-mono break-all">{page.canonicalUrl}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  HTTP {page.httpStatus ?? "—"} ·{" "}
                  {formatTimestamp(page.fetchedAt)} ·{" "}
                  {page.contentSha256.slice(0, 16)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
