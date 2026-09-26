"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
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
import type { ImportDiagnostic } from "@/lib/catalogue-import/import-source";
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

function DiagnosticList({ items }: { items: ImportDiagnostic[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
      ))}
    </ul>
  );
}

/** Parser warnings rarely block publishing, so they start folded away. */
function WarningsNotice({ warnings }: { warnings: ImportDiagnostic[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle className="flex items-center justify-between gap-3">
          {plural(warnings.length, "warning")} from the ANU page
          <CollapsibleTrigger asChild>
            <Button className="-my-1 h-7" size="sm" variant="ghost">
              {open ? "Hide" : "Show"}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "transition-transform motion-reduce:transition-none",
                  open && "rotate-180",
                )}
                size={14}
              />
            </Button>
          </CollapsibleTrigger>
        </AlertTitle>
        <CollapsibleContent asChild>
          <AlertDescription>
            <DiagnosticList items={warnings} />
          </AlertDescription>
        </CollapsibleContent>
      </Alert>
    </Collapsible>
  );
}

function CountChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "added" | "removed" | "unchanged";
}) {
  const Icon = tone === "added" ? Plus : tone === "removed" ? Minus : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
        tone === "added" &&
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
        tone === "removed" &&
          "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
        tone === "unchanged" && "bg-muted text-muted-foreground",
      )}
    >
      {Icon ? <Icon aria-hidden="true" size={12} /> : null}
      {count} {label}
    </span>
  );
}

/**
 * A synced year waiting for a decision. The decision sits at the top beside
 * what it would change, so a long list never pushes it out of reach.
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
    router.push(`/admin/key-dates/${year}`);
    router.refresh();
  }

  async function discard() {
    const result = await discardKeyDatesReviewAction(review.id, year);
    if (!result.ok) throw new Error(result.message);
    toast.success(result.message);
    router.refresh();
  }

  return (
    <section aria-labelledby="key-dates-review" className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2
            id="key-dates-review"
            className="flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            Sync ready to review
            <Badge variant="primary-light">Not yet published</Badge>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <CountChip count={diff.added} label="new" tone="added" />
            <CountChip count={diff.removed} label="removed" tone="removed" />
            <CountChip
              count={diff.unchanged}
              label="unchanged"
              tone="unchanged"
            />
            <span className="text-xs text-muted-foreground">
              · Fetched{" "}
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
            </span>
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-2">
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
                  ? `${plural(diff.added, "new date")} will appear on Key dates and ${plural(diff.removed, "date")} will be archived. Dates entered by hand stay as they are.`
                  : `The ${year} key dates stay as they are and this sync is recorded in the changelog.`
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
        ) : null}
      </div>

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {plural(errors.length, "source error")}{" "}
            {errors.length === 1 ? "blocks" : "block"} publishing. Sync again
            once the ANU page is fixed.
          </AlertTitle>
          <AlertDescription>
            <DiagnosticList items={errors} />
          </AlertDescription>
        </Alert>
      ) : null}
      {warnings.length > 0 ? <WarningsNotice warnings={warnings} /> : null}

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
    </section>
  );
}
