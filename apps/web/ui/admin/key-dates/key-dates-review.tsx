"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Equal,
  ExternalLink,
  Minus,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { cn } from "@/lib/cn";
import {
  approveKeyDatesReviewAction,
  discardKeyDatesReviewAction,
} from "@/lib/admin/key-dates-actions";
import type { KeyDatesReview } from "@/lib/admin/key-dates";
import type { UniversityCalendarReviewDiff } from "@/lib/coursemap/university-calendar-review";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { KeyDatesMonthList } from "@/ui/admin/key-dates/key-dates-month-list";

const timestampFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function SummaryTile({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Plus;
  label: string;
  tone: "added" | "removed" | "unchanged";
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          tone === "added" &&
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
          tone === "removed" &&
            "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
          tone === "unchanged" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={16} />
      </span>
      <div>
        <div className="text-xl leading-tight font-semibold tabular-nums">
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/**
 * A synced year waiting for a decision: what approval would change for
 * students, anything the parser flagged, and the approve and discard actions.
 */
export function KeyDatesReviewPanel({
  canManage,
  diff,
  review,
  year,
}: {
  canManage: boolean;
  diff: UniversityCalendarReviewDiff;
  review: KeyDatesReview;
  year: number;
}) {
  const router = useRouter();
  const changes = diff.added + diff.removed;
  const [view, setView] = useState(changes > 0 ? "changes" : "all");
  const errors = review.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const warnings = review.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  const blocked = errors.length > 0 || review.events.length === 0;
  const changedEvents = diff.events.filter(
    (event) => event.change !== "unchanged",
  );

  async function approve() {
    const result = await approveKeyDatesReviewAction(review.id, year);
    if (!result.ok) throw new Error(result.message);
    toast.success(result.message);
    router.refresh();
  }

  async function discard() {
    const result = await discardKeyDatesReviewAction(review.id, year);
    if (!result.ok) throw new Error(result.message);
    toast.success(result.message);
    router.refresh();
  }

  return (
    <section aria-labelledby="key-dates-review" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="key-dates-review"
            className="flex items-center gap-2 text-base font-semibold"
          >
            Review the {year} sync
            <Badge variant="primary-light">Not yet published</Badge>
          </h2>
          <p className="text-xs text-muted-foreground">
            Fetched{" "}
            <time dateTime={review.fetchedAt}>
              {timestampFormat.format(new Date(review.fetchedAt))}
            </time>{" "}
            from{" "}
            <a
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              href={review.canonicalUrl}
              rel="noreferrer"
              target="_blank"
            >
              the ANU calendar
              <ExternalLink aria-hidden="true" size={12} />
            </a>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={Plus}
          label="New dates"
          tone="added"
          value={diff.added}
        />
        <SummaryTile
          icon={Minus}
          label="Removed dates"
          tone="removed"
          value={diff.removed}
        />
        <SummaryTile
          icon={Equal}
          label="Unchanged"
          tone="unchanged"
          value={diff.unchanged}
        />
      </div>

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {plural(errors.length, "source error")} block publishing
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {errors.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {warnings.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{plural(warnings.length, "warning")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {warnings.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs className="gap-4" onValueChange={setView} value={view}>
        <TabsList aria-label="Review dates" variant="line">
          {(
            [
              ["changes", "Changes", changes],
              ["all", "All dates", diff.events.length],
            ] as const
          ).map(([value, label, count]) => (
            <TabsTrigger key={value} className="gap-2" value={value}>
              {label}
              <Badge
                className={cn(
                  "tabular-nums",
                  view !== value && "text-muted-foreground",
                )}
                variant={view === value ? "primary-light" : "outline"}
              >
                {count}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent className="mt-0" value="changes">
          {changedEvents.length > 0 ? (
            <KeyDatesMonthList events={changedEvents} showChanges />
          ) : (
            <p
              className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"
              role="status"
            >
              <CircleCheck
                aria-hidden="true"
                className="text-emerald-600 dark:text-emerald-400"
                size={16}
              />
              Every date matches what students already see.
            </p>
          )}
        </TabsContent>
        <TabsContent className="mt-0" value="all">
          <KeyDatesMonthList events={diff.events} showChanges />
        </TabsContent>
      </Tabs>

      {canManage ? (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
          <p className="text-sm text-muted-foreground">
            {blocked
              ? "Resolve the source errors and sync again before publishing."
              : changes > 0
                ? `Publishing adds ${plural(diff.added, "date")} and removes ${plural(diff.removed, "date")} for students.`
                : "Publishing records this check without changing what students see."}
          </p>
          <div className="flex gap-2">
            <ConfirmDialog
              confirmLabel="Discard sync"
              description={`Students keep seeing the dates already published for ${year}. You can sync again at any time.`}
              destructive
              onConfirm={discard}
              title={`Discard the ${year} sync?`}
              trigger={
                <Button type="button" variant="outline">
                  Discard
                </Button>
              }
            />
            <ConfirmDialog
              confirmLabel="Publish"
              description={
                changes > 0
                  ? `${plural(diff.added, "new date")} will appear on Key dates and ${plural(diff.removed, "date")} will be archived.`
                  : `The ${year} key dates stay as they are and this sync is recorded in the publishing history.`
              }
              onConfirm={approve}
              title={`Publish the ${year} key dates?`}
              trigger={
                <Button disabled={blocked} type="button">
                  <CircleCheck aria-hidden="true" size={15} />
                  Approve and publish
                </Button>
              }
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
